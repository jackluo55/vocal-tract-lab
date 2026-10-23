importScripts('./speech-dsp.js?v=20261023-speech-3');
let stream=null;
self.onmessage=event=>{try{const {kind,data,sampleRate}=event.data;if(kind==='init'){stream=new SpeechDSP.Stream(sampleRate);return}if(kind==='pcm'&&stream){const frames=stream.push(data);if(frames.length)self.postMessage({frames})}}catch(error){self.postMessage({error:error.message||'语音分析中断'})}};
