/* Salamander Grand Piano recordings by Alexander Holm, CC BY 3.0.
 * Source and attribution: assets/piano/ATTRIBUTION.md.
 */
// Measured steady-segment fundamentals; constant-rate calibration to A4=440 Hz.
const PIANO_REFERENCE_SAMPLES=[{"midi":48,"file":"C3.mp3","frequency":130.634113},{"midi":51,"file":"Ds3.mp3","frequency":155.627692},{"midi":54,"file":"Fs3.mp3","frequency":185.050035},{"midi":57,"file":"A3.mp3","frequency":220.176138},{"midi":60,"file":"C4.mp3","frequency":261.804638},{"midi":63,"file":"Ds4.mp3","frequency":312.052151},{"midi":66,"file":"Fs4.mp3","frequency":369.83401},{"midi":69,"file":"A4.mp3","frequency":440.850617},{"midi":72,"file":"C5.mp3","frequency":524.503341},{"midi":75,"file":"Ds5.mp3","frequency":623.629414},{"midi":78,"file":"Fs5.mp3","frequency":741.94628},{"midi":81,"file":"A5.mp3","frequency":883.109611},{"midi":84,"file":"C6.mp3","frequency":1051.366132}];
const pianoReferenceBuffers=new Map();
function nearestPianoSample(midi){return PIANO_REFERENCE_SAMPLES.reduce((best,s)=>Math.abs(s.midi-midi)<Math.abs(best.midi-midi)?s:best)}
async function loadPianoBuffer(ctx,sample){
  if(!pianoReferenceBuffers.has(sample.file))pianoReferenceBuffers.set(sample.file,(async()=>{const response=await fetch('./assets/piano/'+sample.file);if(!response.ok)throw Error('钢琴采样加载失败');return response.arrayBuffer()})().catch(error=>{pianoReferenceBuffers.delete(sample.file);throw error}));
  const bytes=await pianoReferenceBuffers.get(sample.file);return ctx.decodeAudioData(bytes.slice(0));
}
async function playReferencePitch(button=$('#playReferencePitch')){
  stopReferencePitch();const pitch={...recordingTargetPitch},displayNote=pitchNotation(pitch,$('#newVoicePart').value),originalText='播放钢琴参考音';let tone;
  button.disabled=true;button.textContent=`正在准备 ${displayNote}…`;
  try{
    if(!NATURAL_PITCH_MIDIS.includes(pitch.midi))throw Error('请选择C3—C6列表中的音高');
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('当前浏览器不支持网页音频');
    const ctx=new Context({latencyHint:'interactive'}),gain=ctx.createGain();gain.gain.value=0;
    tone={ctx,oscillators:[],sources:[],button,originalText,finished:false,pitch,kind:'piano-sample'};referenceAudioContext=ctx;referenceTone=tone;
    const sample=nearestPianoSample(pitch.midi),buffer=await loadPianoBuffer(ctx,sample);if(tone.finished||referenceTone!==tone)return;
    const target=PitchCore.midiToFrequency(pitch.midi),rate=target/sample.frequency,source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.setValueAtTime(rate,ctx.currentTime);source.detune.setValueAtTime(0,ctx.currentTime);source.connect(gain);tone.sources.push(source);tone.sample=sample;tone.playbackRate=rate;
    await routeToMediaChannel(ctx,gain,'声道实验台钢琴参考音');if(tone.finished||referenceTone!==tone)return;
    let peak=0,energy=0,count=0;for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));for(let i=Math.floor(.12*buffer.sampleRate);i<Math.min(data.length,.9*buffer.sampleRate);i++){energy+=data[i]*data[i];count++}}
    const volume=Math.min(3.2,.075/Math.max(.001,Math.sqrt(energy/Math.max(1,count))),.82/Math.max(.01,peak));
    const now=ctx.currentTime+.03,duration=Math.min(2.6,buffer.duration/rate-.01);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.004);gain.gain.setValueAtTime(volume,now+Math.max(.01,duration-.08));gain.gain.linearRampToValueAtTime(0,now+duration);source.start(now,0,duration*rate);source.stop(now+duration+.01);
    button.textContent=`正在播放 ${displayNote}…`;button.dataset.audioState='playing';setAudioState('playing',`钢琴 ${pitch.note} · ${target.toFixed(2)} Hz`);
    updatePitchDebug({rawFrequency:target,correctedFrequency:target,confidence:1,source:`钢琴参考音 · ${pitch.note}`,sampleRate:ctx.sampleRate,duration,detector:'钢琴采样、固定播放速率，无滑音'});
    source.onended=()=>{if(referenceTone===tone)stopReferencePitch()};
  }catch(error){if(tone?.finished||tone&&referenceTone!==tone)return;console.error('Piano reference failed.',error);stopReferencePitch();button.disabled=false;button.textContent='重试钢琴参考音';button.dataset.audioState='error';showToast(error.message||'钢琴参考音未能播放')}
}
