import { Device, types as mediasoupClientTypes } from 'mediasoup-client';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { createWorker } from '../';
import { Worker } from '../Worker';
import * as fakeParameters from './fakeParameters';

let worker: Worker;
let device: mediasoupClientTypes.Device;
let sendTransport: mediasoupClientTypes.Transport;
let recvTransport: mediasoupClientTypes.Transport;
let audioProducer: mediasoupClientTypes.Producer;
let videoProducer: mediasoupClientTypes.Producer;
let audioConsumer: mediasoupClientTypes.Consumer;
let videoConsumer: mediasoupClientTypes.Consumer;
let secondAudioProducer: mediasoupClientTypes.Producer;
let dataProducer: mediasoupClientTypes.DataProducer;
let dataConsumer: mediasoupClientTypes.DataConsumer;

test('create a Worker succeeds', async () =>
{
	worker = await createWorker({ logLevel: 'debug' });

	expect(typeof worker.pid).toBe('number');
	expect(worker.closed).toBe(false);
}, 20000);

test('worker.dump() succeeds with empty fields', async () =>
{
	const dump = await worker.dump();

	expect(dump).toEqual(
		{
			pid      : worker.pid,
			players  : [],
			handlers : []
		});
}, 20000);

test('worker.getUserMedia() succeeds', async () =>
{
	const stream = await worker.getUserMedia(
		{
			audio : { source: 'file', file: 'src/tests/data/small.mp4' },
			video : { source: 'file', file: 'src/tests/data/small.mp4' }
		});
	const audioTrack = stream.getTracks()[0];
	const videoTrack = stream.getTracks()[1];

	await expect(worker.dump())
		.resolves
		.toEqual(
			{
				pid     : worker.pid,
				players :
				[
					{
						id         : audioTrack.data.playerId,
						audioTrack :
						{
							id         : audioTrack.id,
							kind       : 'audio',
							readyState : 'live'
						},
						videoTrack :
						{
							id         : videoTrack.id,
							kind       : 'video',
							readyState : 'live'
						}
					}
				],
				handlers : []
			});

	audioTrack.stop();

	await expect(worker.dump())
		.resolves
		.toEqual(
			{
				pid     : worker.pid,
				players :
				[
					{
						id         : audioTrack.data.playerId,
						audioTrack :
						{
							id         : audioTrack.id,
							kind       : 'audio',
							readyState : 'ended'
						},
						videoTrack :
						{
							id         : videoTrack.id,
							kind       : 'video',
							readyState : 'live'
						}
					}
				],
				handlers : []
			});

	stream.close();

	await expect(worker.dump())
		.resolves
		.toEqual(
			{
				pid      : worker.pid,
				players  : [],
				handlers : []
			});
}, 20000);

test('create a Device with worker.createHandlerFactory() as argument succeeds', () =>
{
	device = new Device({ handlerFactory: worker.createHandlerFactory() });

	expect(device.handlerName).toBe('Aiortc');
	expect(device.loaded).toBe(false);
});

test('device.load() succeeds', async () =>
{
	// Assume we get the router RTP capabilities.
	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	await expect(device.load({ routerRtpCapabilities }))
		.resolves
		.toBe(undefined);

	expect(device.loaded).toBe(true);
}, 20000);

test('device.rtpCapabilities getter succeeds', () =>
{
	expect(typeof device.rtpCapabilities).toBe('object');
});

test('device.sctpCapabilities getter succeeds', () =>
{
	expect(typeof device.sctpCapabilities).toBe('object');
});

test('device.createSendTransport() for sending media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	sendTransport = device.createSendTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			appData : { baz: 'BAZ' }
		});

	expect(sendTransport.id).toBe(id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(typeof sendTransport.handler).toBe('object');
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toEqual({ baz: 'BAZ' });
});

test('device.createRecvTransport() for receiving media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	recvTransport = device.createRecvTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters
		});

	expect(recvTransport.id).toBe(id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(typeof recvTransport.handler).toBe('object');
	expect(recvTransport.connectionState).toBe('new');
	expect(recvTransport.appData).toEqual({});
});

test('transport.produce() succeeds', async () =>
{
	const stream = await worker.getUserMedia(
		{
			audio : { source: 'file', file: 'src/tests/data/small.mp4' },
			video : { source: 'file', file: 'src/tests/data/small.mp4' }
		});
	const audioTrack = stream.getTracks()[0];
	const videoTrack = stream.getTracks()[1];
	let audioProducerId;
	let videoProducerId;
	let connectEventNumTimesCalled = 0;
	let produceEventNumTimesCalled = 0;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sendTransport.on('connect', ({ dtlsParameters }, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(typeof dtlsParameters).toBe('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) =>
	{
		produceEventNumTimesCalled++;

		expect(typeof kind).toBe('string');
		expect(typeof rtpParameters).toBe('object');

		let id: string;

		switch (kind)
		{
			case 'audio':
			{
				expect(appData).toEqual({ foo: 'FOO' });

				id = fakeParameters.generateProducerRemoteParameters().id;
				audioProducerId = id;

				break;
			}

			case 'video':
			{
				expect(appData).toEqual({});

				id = fakeParameters.generateProducerRemoteParameters().id;
				videoProducerId = id;

				break;
			}

			default:
			{
				throw new Error('unknown kind');
			}
		}

		// Emulate communication with the server and success response with Producer
		// remote parameters.
		setTimeout(() => callback({ id }));
	});

	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	// Pause the audio track before creating its Producer.
	audioTrack.enabled = false;

	// Use stopTracks: false.
	audioProducer = await sendTransport.produce(
		{ track: audioTrack, stopTracks: false, appData: { foo: 'FOO' } });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(1);
	expect(audioProducer.id).toBe(audioProducerId);
	expect(audioProducer.closed).toBe(false);
	expect(audioProducer.kind).toBe('audio');
	expect(audioProducer.track).toBe(audioTrack);
	expect(typeof audioProducer.rtpParameters).toBe('object');
	expect(typeof audioProducer.rtpParameters.mid).toBe('string');
	expect(audioProducer.rtpParameters.codecs.length).toBe(1);

	codecs = audioProducer.rtpParameters.codecs;
	expect(codecs.length).toBe(1);
	expect(codecs[0].mimeType).toBe('audio/opus');

	headerExtensions = audioProducer.rtpParameters.headerExtensions;
	expect(headerExtensions!.length).toBe(2);
	expect(headerExtensions![0].uri).toBe('urn:ietf:params:rtp-hdrext:ssrc-audio-level');
	expect(headerExtensions![1].uri).toBe('urn:ietf:params:rtp-hdrext:sdes:mid');

	encodings = audioProducer.rtpParameters.encodings;
	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings![0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual([ 'ssrc', 'dtx' ]);
	expect(typeof encodings![0].ssrc).toBe('number');

	rtcp = audioProducer.rtpParameters.rtcp;
	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp!.cname).toBe('string');

	expect(audioProducer.paused).toBe(true);
	expect(audioProducer.maxSpatialLayer).toBe(undefined);
	expect(audioProducer.appData).toEqual({ foo: 'FOO' });

	let dump = await worker.dump();
	let handler = dump.handlers[0];

	expect(handler.signalingState).toBe('stable');
	expect(handler.iceConnectionState).toBe('checking');
	expect(handler.sendTransceivers.length).toBe(1);
	expect(handler.sendTransceivers[0]).toEqual(
		{
			mid     : '0',
			localId : audioProducer.track!.id
		});
	expect(handler.transceivers.length).toBe(1);
	expect(handler.transceivers[0]).toMatchObject(
		{
			mid     : '0',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : audioProducer.track!.id
			}
		});

	// Note that stopTracks is not give so it's true by default.
	videoProducer = await sendTransport.produce({ track: videoTrack });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(2);
	expect(videoProducer.id).toBe(videoProducerId);
	expect(videoProducer.closed).toBe(false);
	expect(videoProducer.kind).toBe('video');
	expect(videoProducer.track).toBe(videoTrack);
	expect(typeof videoProducer.rtpParameters.mid).toBe('string');
	expect(videoProducer.rtpParameters.codecs.length).toBe(2);

	codecs = videoProducer.rtpParameters.codecs;
	expect(codecs.length).toBe(2);
	expect(codecs[0].mimeType).toBe('video/VP8');
	expect(codecs[1].mimeType).toBe('video/rtx');

	headerExtensions = videoProducer.rtpParameters.headerExtensions;
	expect(headerExtensions!.length).toBe(2);
	expect(headerExtensions![0].uri).toBe(
		'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time');
	expect(headerExtensions![1].uri).toBe('urn:ietf:params:rtp-hdrext:sdes:mid');

	encodings = videoProducer.rtpParameters.encodings;
	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings![0]).toBe('object');
	expect(typeof encodings![0].ssrc).toBe('number');
	expect(typeof encodings![0].rtx).toBe('object');
	expect(Object.keys(encodings![0].rtx!)).toEqual([ 'ssrc' ]);
	expect(typeof encodings![0].rtx!.ssrc).toBe('number');

	rtcp = videoProducer.rtpParameters.rtcp;
	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp!.cname).toBe('string');

	expect(videoProducer.paused).toBe(false);
	expect(videoProducer.maxSpatialLayer).toBe(undefined);
	expect(videoProducer.appData).toEqual({});

	dump = await worker.dump();
	handler = dump.handlers[0];

	expect(handler.signalingState).toBe('stable');
	expect(handler.iceConnectionState).toBe('checking');
	expect(handler.sendTransceivers.length).toBe(2);
	expect(handler.sendTransceivers).toEqual(
		[
			{
				mid     : '0',
				localId : audioProducer.track!.id
			},
			{
				mid     : '1',
				localId : videoProducer.track!.id
			}
		]);
	expect(handler.transceivers.length).toBe(2);
	expect(handler.transceivers[0]).toMatchObject(
		{
			mid     : '0',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : audioProducer.track!.id
			}
		});
	expect(handler.transceivers[1]).toMatchObject(
		{
			mid     : '1',
			kind    : 'video',
			stopped : false,
			sender  :
			{
				trackId : videoProducer.track!.id
			}
		});

	sendTransport.removeAllListeners('connect');
	sendTransport.removeAllListeners('produce');
}, 20000);

test('transport.consume() succeeds', async () =>
{
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });
	let connectEventNumTimesCalled = 0;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	recvTransport.on('connect', ({ dtlsParameters }, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(typeof dtlsParameters).toBe('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	audioConsumer = await recvTransport.consume(
		{
			id            : audioConsumerRemoteParameters.id,
			producerId    : audioConsumerRemoteParameters.producerId,
			kind          : audioConsumerRemoteParameters.kind,
			rtpParameters : audioConsumerRemoteParameters.rtpParameters,
			appData       : { bar: 'BAR' }
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
	expect(audioConsumer.producerId).toBe(audioConsumerRemoteParameters.producerId);
	expect(audioConsumer.closed).toBe(false);
	expect(audioConsumer.kind).toBe('audio');
	expect(typeof audioConsumer.track).toBe('object');
	expect(typeof audioConsumer.rtpParameters).toBe('object');
	expect(audioConsumer.rtpParameters.mid).toBe(undefined);
	expect(audioConsumer.rtpParameters.codecs.length).toBe(1);

	codecs = audioConsumer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'audio/opus',
			payloadType  : 100,
			clockRate    : 48000,
			channels     : 2,
			rtcpFeedback : [],
			parameters   :
			{
				useinbandfec : 1,
				foo          : 'bar'
			}
		});

	headerExtensions = audioConsumer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual([]);

	encodings = audioConsumer.rtpParameters.encodings;
	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings![0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual([ 'ssrc', 'dtx' ]);
	expect(typeof encodings![0].ssrc).toBe('number');

	rtcp = audioProducer.rtpParameters.rtcp;
	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp!.cname).toBe('string');

	expect(audioConsumer.paused).toBe(false);
	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });

	videoConsumer = await recvTransport.consume(
		{
			id            : videoConsumerRemoteParameters.id,
			producerId    : videoConsumerRemoteParameters.producerId,
			kind          : videoConsumerRemoteParameters.kind,
			rtpParameters : videoConsumerRemoteParameters.rtpParameters
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
	expect(videoConsumer.producerId).toBe(videoConsumerRemoteParameters.producerId);
	expect(videoConsumer.closed).toBe(false);
	expect(videoConsumer.kind).toBe('video');
	expect(typeof videoConsumer.track).toBe('object');
	expect(typeof videoConsumer.rtpParameters).toBe('object');
	expect(videoConsumer.rtpParameters.mid).toBe(undefined);
	expect(videoConsumer.rtpParameters.codecs.length).toBe(2);

	codecs = videoConsumer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'video/VP8',
			payloadType  : 101,
			clockRate    : 90000,
			rtcpFeedback :
			[
				{ type: 'nack', parameter: '' },
				{ type: 'nack', parameter: 'pli' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'goog-remb', parameter: '' }
			],
			parameters :
			{
				'x-google-start-bitrate' : 1500
			}
		});
	expect(codecs[1]).toEqual(
		{
			mimeType     : 'video/rtx',
			payloadType  : 102,
			clockRate    : 90000,
			rtcpFeedback : [],
			parameters   :
			{
				apt : 101
			}
		});

	headerExtensions = videoConsumer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri        : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
				id         : 3,
				encrypt    : false,
				parameters : {}
			}
		]);

	encodings = videoConsumer.rtpParameters.encodings;
	expect(Array.isArray(encodings)).toBe(true);
	expect(encodings!.length).toBe(1);
	expect(typeof encodings![0]).toBe('object');
	expect(Object.keys(encodings![0])).toEqual([ 'ssrc', 'rtx', 'dtx' ]);
	expect(typeof encodings![0].ssrc).toBe('number');
	expect(typeof encodings![0].rtx).toBe('object');
	expect(Object.keys(encodings![0].rtx!)).toEqual([ 'ssrc' ]);
	expect(typeof encodings![0].rtx!.ssrc).toBe('number');

	rtcp = videoConsumer.rtpParameters.rtcp;
	expect(typeof rtcp).toBe('object');
	expect(typeof rtcp!.cname).toBe('string');

	expect(videoConsumer.paused).toBe(false);
	expect(videoConsumer.appData).toEqual({});

	recvTransport.removeAllListeners('connect');
}, 20000);

test('transport.produceData() succeeds', async () =>
{
	let dataProducerId;
	let produceDataEventNumTimesCalled = 0;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sendTransport.on('producedata', ({ sctpStreamParameters, label, protocol, appData }, callback, errback) =>
	{
		produceDataEventNumTimesCalled++;

		expect(typeof sctpStreamParameters).toBe('object');
		expect(label).toBe('FOO');
		expect(protocol).toBe('BAR');
		expect(appData).toEqual({ foo: 'FOO' });

		const id = fakeParameters.generateDataProducerRemoteParameters().id;

		dataProducerId = id;

		// Emulate communication with the server and success response with Producer
		// remote parameters.
		setTimeout(() => callback({ id }));
	});

	dataProducer = await sendTransport.produceData(
		{
			ordered           : false,
			maxPacketLifeTime : 5555,
			label             : 'FOO',
			protocol          : 'BAR',
			appData           : { foo: 'FOO' }
		});

	expect(produceDataEventNumTimesCalled).toBe(1);
	expect(dataProducer.id).toBe(dataProducerId);
	expect(dataProducer.closed).toBe(false);
	expect(typeof dataProducer.sctpStreamParameters).toBe('object');
	expect(typeof dataProducer.sctpStreamParameters.streamId).toBe('number');
	expect(dataProducer.sctpStreamParameters.ordered).toBe(false);
	expect(dataProducer.sctpStreamParameters.maxPacketLifeTime).toBe(5555);
	expect(dataProducer.sctpStreamParameters.maxRetransmits).toBe(undefined);
	expect(dataProducer.label).toBe('FOO');
	expect(dataProducer.protocol).toBe('BAR');

	sendTransport.removeAllListeners('producedata');
}, 20000);

test('transport.consumeData() succeeds', async () =>
{
	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	dataConsumer = await recvTransport.consumeData(
		{
			id                   : dataConsumerRemoteParameters.id,
			dataProducerId       : dataConsumerRemoteParameters.dataProducerId,
			sctpStreamParameters : dataConsumerRemoteParameters.sctpStreamParameters,
			label                : 'FOO',
			protocol             : 'BAR',
			appData              : { bar: 'BAR' }
		});

	expect(dataConsumer.id).toBe(dataConsumerRemoteParameters.id);
	expect(dataConsumer.dataProducerId).toBe(dataConsumerRemoteParameters.dataProducerId);
	expect(dataConsumer.closed).toBe(false);
	expect(typeof dataConsumer.sctpStreamParameters).toBe('object');
	expect(typeof dataConsumer.sctpStreamParameters.streamId).toBe('number');
	expect(dataConsumer.label).toBe('FOO');
	expect(dataConsumer.protocol).toBe('BAR');
}, 20000);

test('transport.produce() with a receiving track succeeds', async () =>
{
	const audioTrack = audioConsumer.track as FakeMediaStreamTrack;

	expect(audioTrack.data.remote).toBe(true);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) =>
	{

		const id = fakeParameters.generateProducerRemoteParameters().id;

		callback({ id });
	});

	secondAudioProducer = await sendTransport.produce({ track: audioTrack });

	expect(secondAudioProducer.kind).toBe('audio');
	expect(secondAudioProducer.track).toBe(audioTrack);

	sendTransport.removeAllListeners('produce');
}, 20000);

test('transport.getStats() succeeds', async () =>
{
	const stats = await sendTransport.getStats();

	expect(typeof stats).toBe('object');
}, 20000);

test('producer.replaceTrack() succeeds', async () =>
{
	const stream = await worker.getUserMedia(
		{
			audio : { source: 'file', file: 'src/tests/data/small.mp4' },
			video : { source: 'file', file: 'src/tests/data/small.mp4' }
		});
	const newAudioTrack = stream.getTracks()[0];
	const newVideoTrack = stream.getTracks()[1];

	// Have the audio Producer paused.
	audioProducer.pause();

	const audioProducerPreviousTrack = audioProducer.track;

	await expect(audioProducer.replaceTrack({ track: newAudioTrack }))
		.resolves
		.toBe(undefined);

	// Previous track must be 'live' due to stopTracks: false.
	expect(audioProducerPreviousTrack!.readyState).toBe('live');
	expect(audioProducer.track!.readyState).toBe('live');
	expect(audioProducer.track).not.toBe(audioProducerPreviousTrack);
	expect(audioProducer.track).toBe(newAudioTrack);
	// Producer was already paused.
	expect(audioProducer.paused).toBe(true);

	// Reset the audio paused state.
	audioProducer.resume();

	const videoProducerPreviousTrack = videoProducer.track;

	await expect(videoProducer.replaceTrack({ track: newVideoTrack }))
		.resolves
		.toBe(undefined);

	// Previous track must be 'ended' due to stopTracks: true.
	expect(videoProducerPreviousTrack!.readyState).toBe('ended');
	expect(videoProducer.track).not.toBe(videoProducerPreviousTrack);
	expect(videoProducer.track).toBe(newVideoTrack);
	expect(videoProducer.paused).toBe(false);

	const dump = await worker.dump();
	const handler = dump.handlers[0];

	expect(handler.sendTransceivers.length).toBe(3);
	// NOTE: We cannot check the new trackIds since handler.py still uses the
	// original track ids as index in the sending transceivers map.
	expect(handler.sendTransceivers).toMatchObject(
		[
			{ mid: '0' },
			{ mid: '1' },
			{ mid: '3' } // NOTE: mid:2 is DataChannel.
		]);
	expect(handler.transceivers.length).toBe(3);
	expect(handler.transceivers[0]).toMatchObject(
		{
			mid     : '0',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : audioProducer.track!.id
			}
		});
	expect(handler.transceivers[1]).toMatchObject(
		{
			mid     : '1',
			kind    : 'video',
			stopped : false,
			sender  :
			{
				trackId : videoProducer.track!.id
			}
		});
	expect(handler.transceivers[2]).toMatchObject(
		{
			mid     : '3',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : secondAudioProducer.track!.id
			}
		});
}, 20000);

test('producer.getStats() succeeds', async () =>
{
	const stats = await videoProducer.getStats();

	expect(typeof stats).toBe('object');
}, 20000);

test('consumer.getStats() succeeds', async () =>
{
	const stats = await videoConsumer.getStats();

	expect(typeof stats).toBe('object');
}, 20000);

test('consumer.pause() succeed', async () =>
{
	audioConsumer.pause();

	expect(audioConsumer.paused).toBe(true);
});

test('consumer.resume() succeed', async () =>
{
	audioConsumer.resume();

	expect(audioConsumer.paused).toBe(false);
});

test('consumer.close() succeed', () =>
{
	audioConsumer.close();

	expect(audioConsumer.closed).toBe(true);
	expect(audioConsumer.track.readyState).toBe('ended');
});

test('producer.close() succeed', async () =>
{
	audioProducer.close();
	expect(audioProducer.closed).toBe(true);
	// Track will be still 'live' due to stopTracks: false.
	expect(audioProducer.track!.readyState).toBe('live');

	const dump = await worker.dump();
	const handler = dump.handlers[0];

	expect(handler.sendTransceivers.length).toBe(3);
	expect(handler.sendTransceivers).toMatchObject(
		[
			{ mid: '0' },
			{ mid: '1' },
			{ mid: '3' } // NOTE: mid:2 is DataChannel.
		]);
	expect(handler.transceivers.length).toBe(3);
	expect(handler.transceivers[0]).toMatchObject(
		{
			mid     : '0',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : null
			}
		});
	expect(handler.transceivers[1]).toMatchObject(
		{
			mid     : '1',
			kind    : 'video',
			stopped : false,
			sender  :
			{
				trackId : videoProducer.track!.id
			}
		});
	expect(handler.transceivers[2]).toMatchObject(
		{
			mid     : '3',
			kind    : 'audio',
			stopped : false,
			sender  :
			{
				trackId : secondAudioProducer.track!.id
			}
		});
}, 20000);

test('dataConsumer.close() succeed', () =>
{
	dataConsumer.close();

	expect(dataConsumer.closed).toBe(true);
});

test('dataProducer.close() succeed', () =>
{
	dataProducer.close();

	expect(dataProducer.closed).toBe(true);
});

test('worker.close() succeeds', () =>
{
	worker.close();

	expect(worker.closed).toBe(true);
});
