/* Isolated microphone pipeline for speech. Does not modify vowel recording. */
(function(root){'use strict';
class SpeechCapture{constructor(audio,stream,onFrames,onError){this.audio=audio;this.stream=stream;this.onFrames=onFrames;this.onError=onError;this.nodes=[];this.closed=false;this.worker=null}
async connect(){const worker=new Worker('./speech-worker.js?v=20261023-speech-3');this.worker=worker;worker.onmessage=e=>{if(this.closed)return;if(e.data.error)this.onError(e.data.error);else if(e.data.frames)this.onFrames(e.data.frames)};worker.onerror=()=>{if(!this.closed)this.onError('语音检测后台未能启动，请停止后重试。')};worker.postMessage({kind:'init',sampleRate:this.audio.sampleRate});const source=this.audio.createMediaStreamSource(this.stream);this.nodes.push(source);const lowpass=this.audio.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=1400;lowpass.Q.value=.707;source.connect(lowpass);this.nodes.push(lowpass);const mute=this.audio.createGain();mute.gain.value=0;this.nodes.push(mute);let capture;
if(this.audio.audioWorklet&&typeof AudioWorkletNode!=='undefined'){await this.audio.audioWorklet.addModule('./speech-worklet.js?v=20261023-speech-3');if(this.closed)return;capture=new AudioWorkletNode(this.audio,'speech-pcm');capture.port.onmessage=e=>{if(!this.closed)worker.postMessage({kind:'pcm',data:e.data},[e.data.buffer])}}
else{capture=this.audio.createScriptProcessor(1024,1,1);capture.onaudioprocess=e=>{if(this.closed)return;const data=Float32Array.from(e.inputBuffer.getChannelData(0));worker.postMessage({kind:'pcm',data},[data.buffer])}}
if(this.closed){capture.disconnect();return}this.nodes.push(capture);lowpass.connect(capture);capture.connect(mute);mute.connect(this.audio.destination)}
close(){if(this.closed)return;this.closed=true;for(const node of this.nodes)try{node.disconnect()}catch{}this.nodes=[];this.worker?.terminate();this.worker=null}
}
root.SpeechCapture=SpeechCapture;
})(typeof window==='undefined'?globalThis:window);
