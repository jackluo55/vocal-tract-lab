const VOWELS = {
  i:{x:.88,y:.88,f1:300,f2:2400,f3:3000,label:'闭口 · 前元音'},
  e:{x:.73,y:.66,f1:450,f2:2100,f3:2800,label:'半闭 · 前元音'},
  a:{x:.48,y:.16,f1:800,f2:1200,f3:2500,label:'开口 · 央元音'},
  o:{x:.28,y:.49,f1:500,f2:900,f3:2400,label:'半闭 · 后圆唇'},
  u:{x:.14,y:.84,f1:350,f2:700,f3:2200,label:'闭口 · 后圆唇'}
};
const VOWEL_PRESETS={
  a:{tongueHeight:30,tongueFrontness:52,suprahyoidTension:30,thyrohyoidTension:35,jawOpening:72,lipRounding:22,larynxHeight:42,velumOpening:8},
  e:{tongueHeight:68,tongueFrontness:76,suprahyoidTension:34,thyrohyoidTension:35,jawOpening:42,lipRounding:10,larynxHeight:44,velumOpening:7},
  i:{tongueHeight:88,tongueFrontness:90,suprahyoidTension:38,thyrohyoidTension:35,jawOpening:24,lipRounding:5,larynxHeight:46,velumOpening:6},
  o:{tongueHeight:52,tongueFrontness:34,suprahyoidTension:31,thyrohyoidTension:37,jawOpening:48,lipRounding:72,larynxHeight:38,velumOpening:8},
  u:{tongueHeight:82,tongueFrontness:22,suprahyoidTension:36,thyrohyoidTension:39,jawOpening:25,lipRounding:92,larynxHeight:36,velumOpening:6}
};
const TENOR_VOWEL_PRESETS={
  a:{...VOWEL_PRESETS.a,suprahyoidTension:42,thyrohyoidTension:58,jawOpening:60,lipRounding:16,larynxHeight:28,velumOpening:8},
  e:{...VOWEL_PRESETS.e,suprahyoidTension:44,thyrohyoidTension:57,jawOpening:38,lipRounding:8,larynxHeight:30,velumOpening:7},
  i:{...VOWEL_PRESETS.i,suprahyoidTension:46,thyrohyoidTension:56,jawOpening:22,lipRounding:4,larynxHeight:31,velumOpening:6},
  o:{...VOWEL_PRESETS.o,suprahyoidTension:42,thyrohyoidTension:59,jawOpening:44,lipRounding:76,larynxHeight:27,velumOpening:8},
  u:{...VOWEL_PRESETS.u,suprahyoidTension:44,thyrohyoidTension:60,jawOpening:23,lipRounding:90,larynxHeight:26,velumOpening:6}
};
const SOLFEGE={0:'Do',2:'Re',4:'Mi',5:'Fa',7:'Sol',9:'La',11:'Si'};
const NATURAL_PITCH_MIDIS=[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72,74,76,77,79,81,83,84];
const PitchCore=Object.freeze({
  A4_HZ:440,A4_MIDI:69,noteNames:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],
  midiToFrequency(midi){return this.A4_HZ*Math.pow(2,(midi-this.A4_MIDI)/12)},
  frequencyToExactMidi(hz){if(!Number.isFinite(hz)||hz<=0)throw Error('音高频率必须是大于 0 的有限数值');return this.A4_MIDI+12*Math.log2(hz/this.A4_HZ)},
  midiToPitch(midi){const rounded=Math.round(midi),pitchClass=((rounded%12)+12)%12,octave=Math.floor(rounded/12)-1,landmark=rounded===60?'中央 C':rounded===69?'国际标准 La':'';return {midi:rounded,note:`${this.noteNames[pitchClass]}${octave}`,noteName:this.noteNames[pitchClass],octave,solfege:SOLFEGE[pitchClass]||this.noteNames[pitchClass],hz:this.midiToFrequency(rounded),landmark}},
  frequencyToPitch(hz){const exactMidi=this.frequencyToExactMidi(hz),pitch=this.midiToPitch(Math.round(exactMidi));return {...pitch,exactMidi,cents:Math.round((exactMidi-pitch.midi)*100)}}
});
function pitchFromMidi(midi){return PitchCore.midiToPitch(midi)}
function pitchFromHz(hz){return PitchCore.frequencyToPitch(hz)}
let recordingTargetPitch=pitchFromMidi(60);
let humanOctaveAssist=true;
const PARAMETER_LABELS={tongueHeight:'舌高',tongueFrontness:'舌位前后',suprahyoidTension:'舌骨上肌群',thyrohyoidTension:'甲状舌骨肌',jawOpening:'下颌开度',lipRounding:'唇部圆展',larynxHeight:'喉位',velumOpening:'软腭开度'};
const PERSONAL_EMPTY_ID='personal-empty',DEFAULT_VOICE_ID='default-personal';
const DEFAULT_STATE={tongueHeight:30,tongueFrontness:52,suprahyoidTension:30,thyrohyoidTension:35,jawOpening:72,lipRounding:22,larynxHeight:42,velumOpening:18};
const FORMANT_EXPLANATIONS={
  f0:'<b>F0 · 基频</b>：声带每秒振动的次数，也就是你实际唱出的音高。数值越高，声音越高；它不是元音本身的共鸣峰。',
  f1:'<b>F1 · 第一共振峰</b>：主要反映开口程度、下颌开度与舌位高低。一般来说，嘴张得越开、舌位越低，F1 越高。',
  f2:'<b>F2 · 第二共振峰</b>：主要反映舌位前后与唇部圆展。舌位越靠前，F2 通常越高；圆唇、后缩会让 F2 降低。',
  f3:'<b>F3 · 第三共振峰</b>：更多影响声音的明亮度与个性，也会受到声道长度、喉位与咽腔形状影响。它是教学观察值，不单独决定一个元音。'
};
const state={...DEFAULT_STATE,currentVowel:'a',isPhonating:false,voicePackId:DEFAULT_VOICE_ID};
let audio=null,referenceAudioContext=null,referenceTone=null,locked=false,pressing=false,auditionActive=false,auditionSequence=0,phonationRequest=0,dragControl=null,snapshots=[],slots={A:null,B:null},toastTimer=null,auditionTimer=null;
const mediaOutputRoutes=new WeakMap();
const personalSamples={a:null,e:null,i:null,o:null,u:null};
const previewSamples={a:null,e:null,i:null,o:null,u:null};
let previewAudio=null;
const personalVoicePacks=new Map();
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}
function vowelPosition(){
  const jaw=state.jawOpening/100,round=state.lipRounding/100;
  return {x:clamp(state.tongueFrontness/100-round*.16,0,1),y:clamp(state.tongueHeight/100-jaw*.22+.12,0,1)};
}
function vowelWeights(){
  return Object.fromEntries(Object.keys(VOWELS).map(k=>[k,k===state.currentVowel?1:0]));
}
function personalVoiceAnalysis(){return personalVoicePacks.get(state.voicePackId)?.analysis||null}
function vowelPreset(vowel){return personalVoiceAnalysis()?.vowels?.[vowel]?.params||VOWEL_PRESETS[vowel]}
function acousticValues(){
  const personal=personalVoiceAnalysis(),measured=personal?.vowels?.[state.currentVowel];
  const profile={f0:personal?.f0||recordingTargetPitch.hz,formantScale:1};
  const w=vowelWeights(),base=measured?{...VOWELS[state.currentVowel],f1:measured.f1,f2:measured.f2,f3:measured.f3}:VOWELS[state.currentVowel],anchor=vowelPreset(state.currentVowel);
  const lengthScale=(1+(state.larynxHeight-anchor.larynxHeight)*.0024+(state.thyrohyoidTension-anchor.thyrohyoidTension)*.00045)*profile.formantScale;
  const f1=clamp((base.f1+(state.jawOpening-anchor.jawOpening)*2.6-(state.tongueHeight-anchor.tongueHeight)*1.7)*lengthScale,180,1100);
  const f2=clamp((base.f2+(state.tongueFrontness-anchor.tongueFrontness)*7.2-(state.lipRounding-anchor.lipRounding)*3.7)*lengthScale,450,3000);
  const f3=clamp((base.f3+(state.larynxHeight-anchor.larynxHeight)*4+(state.suprahyoidTension-anchor.suprahyoidTension)*1.2)*profile.formantScale,1500,3800);
  return {nearest:state.currentVowel,f0:Math.round(measured?.f0||profile.f0),f1:Math.round(f1),f2:Math.round(f2),f3:Math.round(f3),weights:w,pos:vowelPosition()};
}
function render(){
  $$('.control-row').forEach(row=>{const key=row.dataset.key,input=row.querySelector('input'),val=Math.round(state[key]);input.value=val;input.style.setProperty('--pct',`${val}%`);row.querySelector('output').value=val});
  const a=acousticValues();
  $('#nearestVowel').textContent=`[${a.nearest}]`; $('#vowelDescription').textContent=VOWELS[a.nearest].label;
  ['f0','f1','f2','f3'].forEach(k=>$(`#${k}Value`).textContent=a[k]);
  $$('.vowel-anchor').forEach(el=>el.classList.toggle('active',el.dataset.vowel===a.nearest));
  $$('.vowel-button').forEach(el=>{const active=el.dataset.vowelSelect===a.nearest;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
  $('#vowelCursor').setAttribute('transform',`translate(${95+a.pos.x*290} ${220-a.pos.y*185})`);
  const th=state.tongueHeight,tf=state.tongueFrontness,sh=state.suprahyoidTension,thy=state.thyrohyoidTension,jo=state.jawOpening,lr=state.lipRounding,lh=state.larynxHeight,vo=state.velumOpening;
  const tx=500+tf*2.2,ty=600-th*2;
  $('#tonguePath').setAttribute('d',`M${354+tf*.55} ${564+jo*.18} C${430+tf*.35} ${585-th*2.15} ${510+tf*2.3} ${590-th*2.1} ${795+tf*.32} ${610-th*.25} C${738+tf*.16} ${632+jo*.38} ${575+tf*.3} ${676+jo*.2} ${400+tf*.12} ${637+jo*.12} C370 ${625+jo*.06} 352 ${595+jo*.08} ${354+tf*.55} ${564+jo*.18}Z`);
  $('#suprahyoidPath').setAttribute('d',`M${450+sh*.34} ${682-sh*.18} Q${575+sh*.7} ${724-sh*.32} ${704+sh*.62} ${687-sh*.45} Q${640+sh*.22} ${758-sh*.4} ${490+sh*.2} ${739-sh*.25}Z`);
  $('#thyrohyoidPath').setAttribute('d',`M${714+thy*.25} ${694-thy*.16} Q${761+thy*.3} ${727-thy*.18} ${772+thy*.25} ${808-thy*.42} L${735+thy*.18} ${816-thy*.36} Q${737+thy*.15} ${751-thy*.2} ${696+thy*.25} ${718-thy*.12}Z`);
  moveHandle('tongue',tx,ty); moveHandle('jawOpening',500,690+jo*.3); moveHandle('lipRounding',320-lr*.28,520); moveHandle('velumOpening',765,410+vo*.7); moveHandle('suprahyoidTension',620+sh*1.05,724-sh*.65); moveHandle('thyrohyoidTension',748+thy*.45,782-thy*.72); moveHandle('larynxHeight',790,835-lh*1.2);
  $('#jawGroup').setAttribute('transform',`rotate(${jo*.055-3} 352 618) translate(0 ${jo*.12})`);
  const rounding=lr/100;
  $('#lipsGroup').setAttribute('transform',`translate(${-rounding*18} 0) translate(334 520) scale(${1+rounding*.1} ${1-rounding*.12}) translate(-334 -520)`);
  $('#larynxGroup').setAttribute('transform',`translate(0 ${48-lh*.96-thy*.14})`);
  $('#velumGroup').setAttribute('transform',`rotate(${vo*.16-5} 715 370)`);
  const hv=$('[data-control="tongue"] .handle-value'); if(hv)hv.textContent=`H ${Math.round(th)} · F ${Math.round(tf)}`;
  $$('[role="slider"].handle').forEach(h=>{const key=h.dataset.control;h.setAttribute('aria-valuenow',key==='tongue'?Math.round(th):Math.round(state[key]))});
  document.body.classList.toggle('playing',state.isPhonating); updateAudio(a);
  renderCalibration();renderPitchSelection();renderComparison();
}
function renderCalibration(){
  const card=$('#voiceCalibration');if(!card)return;
  const pack=personalVoicePacks.get(state.voicePackId),item=personalVoiceAnalysis()?.vowels?.[state.currentVowel];
  $('#calibrationName').textContent=`${item?($('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','')||'我的声线'):'我的声线 · 尚未录制'} · [${state.currentVowel}]`;
  $('#calibrationTarget').textContent=item?(personalVoiceAnalysis()?.targetPitch?.note||'保留原音高'):'—';
  $('#calibrationMeasured').textContent=item?`${Number(item.measuredF0??item.f0).toFixed(2)} Hz`:'—';
  $('#calibrationStability').textContent=item?`F1 ${Math.round(item.f1)} · F2 ${Math.round(item.f2)}`:'—';
  $('#calibrationSource').textContent=item?(pack?.source==='bundled'?'网站初始模型 · 作者授权':'浏览器本机分析 · 不上传'):'请创建个人声线';
  card.classList.add('personal');
}
function renderComparison(){
  const rows=$('#comparisonRows');if(!rows)return;
  const target=tenorPresetAtPitch(state.currentVowel),voiceName=$('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','').replace(' · 请先录制','')||'我的声线';
  $('#comparisonCurrentName').textContent=voiceName;$('#comparisonVowel').textContent=`[${state.currentVowel}]`;$('#comparisonPitch').textContent=pitchLabel();$('#comparisonTenorName').textContent=`经典男高音 ${recordingTargetPitch.note}`;
  rows.innerHTML=Object.keys(DEFAULT_STATE).map(key=>{const current=Math.round(state[key]),reference=Math.round(target[key]),difference=current-reference,differenceText=difference===0?'相同':`${difference>0?'+':''}${difference}`;return `<div class="comparison-row"><span>${PARAMETER_LABELS[key]}</span><div class="comparison-pair"><div class="comparison-value current-value"><span style="width:${current}%"></span><b>${current}</b></div><div class="comparison-value tenor-value"><span style="width:${reference}%"></span><b>${reference}</b></div></div><small class="${difference===0?'same':''}">${differenceText}</small></div>`}).join('');
}
function pitchLabel(){return `${recordingTargetPitch.solfege} · ${recordingTargetPitch.note}${recordingTargetPitch.landmark?`（${recordingTargetPitch.landmark}）`:''} · ${recordingTargetPitch.hz.toFixed(2)} Hz`}
function updatePitchDebug({rawFrequency,correctedFrequency,confidence,source='真人录音',sampleRate,duration,detector='MPM + YIN'}={}){const corrected=Number(correctedFrequency),pitch=Number.isFinite(corrected)&&corrected>0?PitchCore.frequencyToPitch(corrected):null;if($('#pitchDebugSource'))$('#pitchDebugSource').textContent=source;if($('#debugRawFrequency'))$('#debugRawFrequency').textContent=Number.isFinite(Number(rawFrequency))?`${Number(rawFrequency).toFixed(2)} Hz`:'—';if($('#debugCorrectedFrequency'))$('#debugCorrectedFrequency').textContent=pitch?`${corrected.toFixed(2)} Hz`:'—';if($('#debugPitchConfidence'))$('#debugPitchConfidence').textContent=Number.isFinite(Number(confidence))?Number(confidence).toFixed(3):'—';if($('#debugMidi'))$('#debugMidi').textContent=pitch?String(pitch.midi):'—';if($('#debugNote'))$('#debugNote').textContent=pitch?pitch.noteName:'—';if($('#debugOctave'))$('#debugOctave').textContent=pitch?String(pitch.octave):'—';if($('#debugSampleRate'))$('#debugSampleRate').textContent=Number.isFinite(Number(sampleRate))?`${Number(sampleRate)} Hz`:'—';if($('#debugDuration'))$('#debugDuration').textContent=Number.isFinite(Number(duration))?`${Number(duration).toFixed(2)} s`:'—';if($('#debugDetector'))$('#debugDetector').textContent=detector}
function resetPitchDebugForTarget(){updatePitchDebug({source:`尚未分析录音 · 当前目标 ${recordingTargetPitch.note} ${recordingTargetPitch.hz.toFixed(2)} Hz`,detector:'等待真人录音'})}
function runPitchCoreTests(){
  const landmarks=[{midi:48,note:'C3',hz:130.8128},{midi:60,note:'C4',hz:261.6256},{midi:72,note:'C5',hz:523.2511},{midi:84,note:'C6',hz:1046.5023}],results=[];
  landmarks.forEach(test=>{const fromMidi=PitchCore.midiToPitch(test.midi),fromFrequency=PitchCore.frequencyToPitch(test.hz);results.push({name:`MIDI ${test.midi} → ${test.note}`,pass:fromMidi.note===test.note});results.push({name:`${test.note} → ${test.hz} Hz`,pass:Math.abs(fromMidi.hz-test.hz)<.0001});results.push({name:`${test.hz} Hz → ${test.note}`,pass:fromFrequency.note===test.note&&fromFrequency.midi===test.midi})});
  const passed=results.filter(result=>result.pass).length,status=$('#pitchTestStatus');if(status){status.textContent=`科学音高自动测试：${passed}/${results.length} ${passed===results.length?'全部通过':'存在失败'}`;status.dataset.state=passed===results.length?'passed':'failed'}console.table(results);return {passed,total:results.length,results};
}
function tenorPresetAtPitch(vowel){const semitones=12*Math.log2(recordingTargetPitch.hz/261.63),base=TENOR_VOWEL_PRESETS[vowel],rise=Math.max(-12,Math.min(12,semitones));return {...base,jawOpening:clamp(base.jawOpening+Math.max(0,rise)*1.25+Math.min(0,rise)*.35),tongueHeight:clamp(base.tongueHeight-rise*.55),tongueFrontness:clamp(base.tongueFrontness-rise*.35),suprahyoidTension:clamp(base.suprahyoidTension+rise*.35),thyrohyoidTension:clamp(base.thyrohyoidTension+rise*.45),larynxHeight:clamp(base.larynxHeight+rise*.35)}}
function renderPitchSelection(){
  const label=pitchLabel();if($('#activePitchLabel'))$('#activePitchLabel').textContent=label;if($('#recordingPitchLabel'))$('#recordingPitchLabel').textContent=label;
  $$('.pitch-option').forEach(button=>{const active=Number(button.dataset.midi)===recordingTargetPitch.midi;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
}
function moveHandle(key,x,y){const h=$(`[data-control="${key}"]`); if(!h)return; const circles=h.querySelectorAll('circle');circles.forEach(c=>{c.setAttribute('cx',x);c.setAttribute('cy',y)});const texts=h.querySelectorAll('text');texts.forEach((t,i)=>{if(key==='tongue'){t.setAttribute('x',x+22);t.setAttribute('y',y+(i?12:-7))}else if(key==='jawOpening'){t.setAttribute('x',x+21);t.setAttribute('y',y+5)}else if(key==='lipRounding'){t.setAttribute('x',x-45);t.setAttribute('y',y-27)}else if(key==='velumOpening'){t.setAttribute('x',x+22);t.setAttribute('y',y-5)}else{t.setAttribute('x',x+25);t.setAttribute('y',y+5)}})}
function setParam(key,value){state[key]=clamp(Number(value));render()}
async function selectVowel(vowel,{audition=true}={}){
  state.currentVowel=vowel;Object.assign(state,vowelPreset(vowel));render();showToast(`已选择 [${vowel}]；继续调舌位仍保持 [${vowel}]`);
  if(!audition||locked)return;
  clearTimeout(auditionTimer);const sequence=++auditionSequence;auditionActive=true;
  const started=await startPhonation();
  if(sequence!==auditionSequence||!started)return;
  auditionTimer=setTimeout(()=>{if(sequence!==auditionSequence)return;auditionActive=false;stopPhonation()},2200);
}
async function switchVoice(id,{announce=true}={}){
  clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;pressing=false;locked=false;phonationRequest++;state.isPhonating=false;syncLockUi();
  state.voicePackId=id;$('#voiceSelect').value=id;stopAndClearAudio();
  audio=await initAudio();if(personalVoicePacks.has(id))await loadVoicePack(id);
  Object.assign(state,vowelPreset(state.currentVowel));
  if(announce)showToast('已载入我的声线及五个专属元音参数点');render();
}
function applyTenorPreset(){
  clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;pressing=false;locked=false;phonationRequest++;state.isPhonating=false;
  const phonateButton=$('#phonateButton'),vowel=state.currentVowel,voiceName=$('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','')||'我的声线';phonateButton.classList.remove('is-playing');syncLockUi();
  Object.assign(state,tenorPresetAtPitch(vowel));
  render();if(audio?.mode!=='error')setAudioState('ready',`${voiceName} · [${vowel}] ${recordingTargetPitch.note} 参数已载入`);showToast(`已将 [${vowel}] 的 ${recordingTargetPitch.note}（${recordingTargetPitch.hz.toFixed(2)} Hz）男高音估算构形应用到${voiceName}；声线未切换`);
}

async function routeToMediaChannel(ctx,node,label='声道实验台音频'){
  let route=mediaOutputRoutes.get(ctx);
  if(!route){
    const element=document.createElement('audio');
    element.className='media-channel-output';element.setAttribute('playsinline','');element.setAttribute('webkit-playsinline','');element.setAttribute('aria-label',label);element.volume=1;
    const destination=typeof ctx.createMediaStreamDestination==='function'?ctx.createMediaStreamDestination():null;
    route={element,destination,nodes:new Set(),fallbackNodes:new Set(),mode:destination?'media':'webaudio'};mediaOutputRoutes.set(ctx,route);document.body.append(element);
    if(destination)element.srcObject=destination.stream;
  }
  if(!route.nodes.has(node)){node.connect(route.destination||ctx.destination);route.nodes.add(node)}
  if(!route.destination)return route;
  try{
    const resumePromise=ctx.state==='suspended'?ctx.resume():Promise.resolve();
    const playPromise=route.element.play();
    await Promise.all([resumePromise,playPromise]);route.fallbackNodes.forEach(fallbackNode=>{try{fallbackNode.disconnect(ctx.destination)}catch{}});route.fallbackNodes.clear();route.mode='media';
  }catch(err){
    console.warn('Media-channel playback unavailable; using Web Audio output.',err);
    if(!route.fallbackNodes.has(node)){node.connect(ctx.destination);route.fallbackNodes.add(node)}
    route.mode='webaudio';
  }
  return route;
}
async function resumeMediaChannel(ctx){
  const route=mediaOutputRoutes.get(ctx);if(!route)return;
  if(ctx.state==='suspended')await ctx.resume();
  if(route.destination){try{await route.element.play();route.fallbackNodes.forEach(node=>{try{node.disconnect(ctx.destination)}catch{}});route.fallbackNodes.clear();route.mode='media'}catch(err){console.warn('Media channel could not resume.',err)}}
}
function releaseMediaChannel(ctx){const route=mediaOutputRoutes.get(ctx);if(!route)return;try{route.element.pause();route.element.srcObject=null;route.element.remove()}catch{}mediaOutputRoutes.delete(ctx)}

async function initAudio(){
  if(audio){if(audio.ready)await audio.ready;return audio}
  setAudioState('loading','载入声线…');
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const sum=ctx.createGain(),nasal=ctx.createBiquadFilter(),notch=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),rounding=ctx.createBiquadFilter(),body=ctx.createBiquadFilter(),f1Filter=ctx.createBiquadFilter(),f2Filter=ctx.createBiquadFilter(),f3Filter=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor(),master=ctx.createGain(),analyser=ctx.createAnalyser();
  nasal.type='peaking';nasal.frequency.value=280;nasal.Q.value=1.2;notch.type='notch';notch.frequency.value=900;notch.Q.value=2;tone.type='highshelf';tone.frequency.value=1800;rounding.type='lowpass';rounding.frequency.value=7600;rounding.Q.value=.72;body.type='lowshelf';body.frequency.value=520;compressor.threshold.value=-16;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.01;compressor.release.value=.18;master.gain.value=0;analyser.fftSize=2048;analyser.smoothingTimeConstant=.8;
  [f1Filter,f2Filter,f3Filter].forEach((filter,i)=>{filter.type='peaking';filter.Q.value=[4,5,6][i];filter.gain.value=[8,7,5][i]});
  sum.connect(nasal).connect(notch).connect(tone).connect(rounding).connect(body).connect(f1Filter).connect(f2Filter).connect(f3Filter).connect(compressor).connect(master).connect(analyser);
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve});
  audio={ctx,sum,nasal,notch,tone,rounding,body,f1Filter,f2Filter,f3Filter,compressor,master,analyser,outputRoute:null,gains:{},sources:[],loopers:{},loopTimer:null,oscillators:[],mode:'samples',raf:null,ready,readyResolve};
  audio.outputRoute=await routeToMediaChannel(ctx,analyser,'声道实验台持续发声音频');
  audio.mode='empty';audio.readyResolve();audio.ready=null;setAudioState('ready',personalVoicePacks.has(state.voicePackId)?'正在载入我的声线':'请先创建我的声线');drawSpectrum();render();return audio;
}
function createLoopSource(k,buffer,meta={}){
  const gain=audio.ctx.createGain(),loopStart=Math.max(.03,Math.min(meta.loopStart??.12,buffer.duration-.35)),loopEnd=Math.max(loopStart+.25,Math.min(meta.loopEnd??buffer.duration-.12,buffer.duration-.02)),crossfade=Math.min(meta.crossfade??.14,(loopEnd-loopStart)*.22);
  gain.gain.value=0;gain.connect(audio.sum);audio.gains[k]=gain;
  audio.loopers[k]={buffer,gain,loopStart,loopEnd,crossfade,nextTime:audio.ctx.currentTime+.06};
  scheduleVoiceLoops();
  if(!audio.loopTimer)audio.loopTimer=setInterval(scheduleVoiceLoops,1800);
}
function scheduleVoiceLoops(){
  if(!audio||audio.ctx.state==='closed')return;
  const horizon=audio.ctx.currentTime+9;
  Object.values(audio.loopers).forEach(loop=>{
    const duration=loop.loopEnd-loop.loopStart,step=duration-loop.crossfade;
    while(loop.nextTime<horizon){
      const source=audio.ctx.createBufferSource(),envelope=audio.ctx.createGain(),start=loop.nextTime,end=start+duration;
      source.buffer=loop.buffer;envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(1,start+loop.crossfade);envelope.gain.setValueAtTime(1,Math.max(start+loop.crossfade,end-loop.crossfade));envelope.gain.linearRampToValueAtTime(0,end);
      source.connect(envelope).connect(loop.gain);source.start(start,loop.loopStart,duration);source.stop(end+.03);audio.sources.push(source);source.onended=()=>{if(audio)audio.sources=audio.sources.filter(item=>item!==source)};loop.nextTime+=step;
    }
  });
}
function updateAudio(a=acousticValues()){
  if(!audio)return;const now=audio.ctx.currentTime;
  Object.entries(a.weights).forEach(([k,w])=>audio.gains[k]?.gain.setTargetAtTime(Math.sqrt(w),now,.055));
  const anchor=vowelPreset(state.currentVowel);
  const heightDelta=state.tongueHeight-anchor.tongueHeight,frontDelta=state.tongueFrontness-anchor.tongueFrontness,jawDelta=state.jawOpening-anchor.jawOpening,roundDelta=state.lipRounding-anchor.lipRounding;
  audio.nasal.gain.setTargetAtTime(state.velumOpening*.18,now,.07);audio.notch.frequency.setTargetAtTime(680+state.velumOpening*4.2,now,.07);audio.notch.Q.setTargetAtTime(1.2+state.velumOpening*.075,now,.07);
  audio.tone.gain.setTargetAtTime(frontDelta*.22-roundDelta*.13+(state.larynxHeight-42)*.09+(state.suprahyoidTension-30)*.045,now,.07);
  audio.rounding?.frequency.setTargetAtTime(clamp(7800-state.lipRounding*52+state.jawOpening*12,2200,9200),now,.07);
  audio.body?.gain.setTargetAtTime(clamp(jawDelta*.11-heightDelta*.055-(state.larynxHeight-42)*.07,-10,10),now,.07);
  audio.f1Filter?.frequency.setTargetAtTime(a.f1,now,.07);audio.f2Filter?.frequency.setTargetAtTime(a.f2,now,.07);audio.f3Filter?.frequency.setTargetAtTime(a.f3,now,.07);
  audio.f1Filter?.gain.setTargetAtTime(clamp(7+Math.abs(jawDelta-heightDelta*.5)*.075,7,13),now,.07);audio.f2Filter?.gain.setTargetAtTime(clamp(6+Math.abs(frontDelta-roundDelta*.4)*.065,6,12),now,.07);audio.f3Filter?.gain.setTargetAtTime(clamp(4+(state.suprahyoidTension+state.thyrohyoidTension-65)*.055,3,10),now,.07);
  audio.master.gain.setTargetAtTime(state.isPhonating&&audio.mode!=='error'?.72:0,now,.035);
}
async function startPhonation(){
  if(!personalVoicePacks.has(state.voicePackId)){pressing=false;auditionActive=false;locked=false;syncLockUi();$('#voiceDialog').showModal();showToast('请先录制或导入五个元音，创建“我的声线”');return false}
  const request=++phonationRequest;
  try{
    await initAudio();await resumeMediaChannel(audio.ctx);
    if(audio.mode==='empty'){
      setAudioState('loading','正在载入五个元音…');
      const currentAudio=audio;
      if(!currentAudio.voiceLoadPromise)currentAudio.voiceLoadPromise=loadVoicePack(state.voicePackId).finally(()=>{currentAudio.voiceLoadPromise=null});
      await currentAudio.voiceLoadPromise;
    }
    if(request!==phonationRequest||(!pressing&&!locked&&!auditionActive)||audio.mode==='error')return false;
    if(audio.ctx.state==='suspended')await audio.ctx.resume();
    state.isPhonating=true;setAudioState('playing',`正在发 [${state.currentVowel}]`);$('#phonateButton').classList.add('is-playing');$('#phonateButton').setAttribute('aria-pressed','true');render();return true;
  }catch(err){
    console.error('Voice playback failed.',err);auditionActive=false;pressing=false;locked=false;syncLockUi();state.isPhonating=false;
    if(audio)audio.mode='error';setAudioState('error','声音无法播放，请刷新后重试');showToast('声音加载失败；请刷新网页后重试');return false;
  }
}
function stopPhonation(){if(locked)return;auditionActive=false;phonationRequest++;state.isPhonating=false;setAudioState(audio?'ready':'','等待发声');$('#phonateButton').classList.remove('is-playing');$('#phonateButton').setAttribute('aria-pressed','false');render()}
function setAudioState(cls,text){const el=$('#audioState');el.className=`audio-state ${cls}`;el.lastElementChild.textContent=text}
function drawSpectrum(){
  if(!audio)return;const canvas=$('#spectrumCanvas'),ctx=canvas.getContext('2d'),data=new Uint8Array(audio.analyser.frequencyBinCount);
  const draw=()=>{audio.raf=requestAnimationFrame(draw);const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth*dpr,h=canvas.clientHeight*dpr;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}audio.analyser.getByteFrequencyData(data);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#183542';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke()}const bins=Math.min(data.length,Math.floor(5000/(audio.ctx.sampleRate/2)*data.length));ctx.beginPath();for(let i=0;i<bins;i++){const x=i/(bins-1)*w,y=h-(data[i]/255)*(h*.92);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.strokeStyle='#4ce0c1';ctx.lineWidth=2*dpr;ctx.stroke();const level=data.slice(0,bins).reduce((n,v)=>n+v,0)/(bins*255);$$('.level-meter span').forEach((el,i)=>{const active=i/8<level*1.7;el.style.height=`${20+Math.max(0,level*110-i*7)}%`;el.style.background=active?(i>6?'#ff7f8f':i>4?'#ffd166':'#4ce0c1'):'#203945'})};draw();
}

function bindControls(){
  $$('.control-row input').forEach(input=>input.addEventListener('input',e=>setParam(e.target.closest('.control-row').dataset.key,e.target.value)));
  $$('.vowel-button').forEach(button=>button.addEventListener('click',()=>selectVowel(button.dataset.vowelSelect)));
  $('#applyTenorPreset').addEventListener('click',applyTenorPreset);
  $('#resetButton').addEventListener('click',()=>{Object.assign(state,DEFAULT_STATE);state.currentVowel='a';render();showToast('已恢复默认构形')});
  const svg=$('#tractSvg');
  $$('.handle').forEach(h=>{h.addEventListener('pointerdown',e=>{dragControl=h.dataset.control;h.setPointerCapture(e.pointerId);e.preventDefault()});h.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?5:2,key=h.dataset.control;if(key==='tongue')setParam(e.key==='ArrowUp'||e.key==='ArrowDown'?'tongueHeight':'tongueFrontness',(e.key==='ArrowUp'||e.key==='ArrowRight'?1:-1)*step+state[e.key==='ArrowUp'||e.key==='ArrowDown'?'tongueHeight':'tongueFrontness']);else setParam(key,state[key]+(e.key==='ArrowUp'||e.key==='ArrowRight'?step:-step))})});
  svg.addEventListener('pointermove',e=>{if(!dragControl)return;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());if(dragControl==='tongue'){setParam('tongueFrontness',(p.x-500)/2.2);setParam('tongueHeight',(600-p.y)/2)}else if(dragControl==='jawOpening')setParam('jawOpening',(p.y-690)/.3);else if(dragControl==='lipRounding')setParam('lipRounding',(320-p.x)/.28);else if(dragControl==='velumOpening')setParam('velumOpening',(p.y-410)/.7);else if(dragControl==='suprahyoidTension')setParam('suprahyoidTension',(p.x-620)/1.05);else if(dragControl==='thyrohyoidTension')setParam('thyrohyoidTension',(p.x-748)/.45);else if(dragControl==='larynxHeight')setParam('larynxHeight',(835-p.y)/1.2)});window.addEventListener('pointerup',()=>dragControl=null);
}
function showFormantExplanation(key){
  if(!FORMANT_EXPLANATIONS[key])return;
  $$('.formant-cell').forEach(cell=>{const active=cell.dataset.formant===key;cell.classList.toggle('selected',active);cell.setAttribute('aria-pressed',String(active))});
  $('#formantExplanation').innerHTML=FORMANT_EXPLANATIONS[key];
}
function bindFormantExplainer(){
  $$('.formant-cell').forEach(cell=>{
    const select=()=>showFormantExplanation(cell.dataset.formant);
    cell.addEventListener('click',select);
    cell.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select()}});
  });
}
function bindPhonation(){
  const btn=$('#phonateButton');let pressStarted=0;
  btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;if(locked){toggleLock();return}pressStarted=performance.now();pressing=true;startPhonation()});
  window.addEventListener('pointerup',()=>{if(!pressing)return;const quickTap=performance.now()-pressStarted<320;pressing=false;if(quickTap){locked=true;syncLockUi()}else stopPhonation()});
  btn.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();pressing=true;startPhonation()}});btn.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){pressing=false;stopPhonation()}});$('#lockButton').addEventListener('click',toggleLock);
}
function syncLockUi(){$('#lockButton').classList.toggle('active',locked);$('#lockButton').textContent=`持续发声：${locked?'开':'关'}`;$('#lockButton').setAttribute('aria-pressed',String(locked));$('#phonateButton').setAttribute('aria-pressed',String(locked||state.isPhonating))}
async function toggleLock(){locked=!locked;syncLockUi();if(locked)await startPhonation();else{phonationRequest++;state.isPhonating=false;$('#phonateButton').classList.remove('is-playing');$('#phonateButton').setAttribute('aria-pressed','false');render();setAudioState(audio?'ready':'','等待发声')}}

function bindSnapshots(){
  $('#savePreset').addEventListener('click',async()=>{const name=$('#presetName').value.trim()||`构形 ${snapshots.length+1}`,a=acousticValues(),snap={id:crypto.randomUUID(),name,createdAt:new Date().toISOString(),voicePack:state.voicePackId,selectedVowel:state.currentVowel,params:Object.fromEntries(Object.keys(DEFAULT_STATE).map(k=>[k,state[k]])),...a};snapshots.unshift(snap);await dbPut('snapshots',snap);$('#presetName').value='';renderSnapshots();showToast(`已保存“${name}”`)});
  $('#swapAB').addEventListener('click',()=>{[slots.A,slots.B]=[slots.B,slots.A];saveSlots();renderSnapshots()});
  $$('.ab-slot').forEach(el=>el.addEventListener('click',()=>{const snap=snapshots.find(s=>s.id===slots[el.dataset.slot]);if(snap){loadSnapshot(snap);$$('.ab-slot').forEach(x=>x.classList.remove('active'));el.classList.add('active')}else showToast(`请先将一个构形设为 ${el.dataset.slot}`)}));
  $('#exportCsv').addEventListener('click',exportCsv);
}
function renderSnapshots(){
  $('#snapshotCount').textContent=`${snapshots.length} 个快照`;['A','B'].forEach(k=>{const el=$(`#slot${k}`),snap=snapshots.find(s=>s.id===slots[k]);el.querySelector('strong').textContent=snap?snap.name:'未设置';el.querySelector('small').textContent=snap?`[${snap.nearest}] · F2 ${snap.f2}`:'点击载入'});
  const list=$('#snapshotList');if(!snapshots.length){list.innerHTML='<p class="empty-state">保存一个构形，开始 A/B 比较。</p>';return}list.innerHTML=snapshots.map(s=>`<div class="snapshot-item" data-id="${s.id}"><span><strong>${escapeHtml(s.name)}</strong><small>[${s.nearest}] · ${new Date(s.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></span><button class="mini-button load">载入</button><button class="mini-button set-a">设 A</button><button class="mini-button set-b">设 B</button><button class="mini-button delete">×</button></div>`).join('');
  $$('.snapshot-item').forEach(row=>{const snap=snapshots.find(s=>s.id===row.dataset.id);row.querySelector('.load').onclick=()=>loadSnapshot(snap);row.querySelector('.set-a').onclick=()=>{slots.A=snap.id;saveSlots();renderSnapshots()};row.querySelector('.set-b').onclick=()=>{slots.B=snap.id;saveSlots();renderSnapshots()};row.querySelector('.delete').onclick=async()=>{snapshots=snapshots.filter(s=>s.id!==snap.id);if(slots.A===snap.id)slots.A=null;if(slots.B===snap.id)slots.B=null;await dbDelete('snapshots',snap.id);saveSlots();renderSnapshots()}});
}
function loadSnapshot(s){Object.entries(s.params).forEach(([k,v])=>state[k]=v);state.currentVowel=s.selectedVowel||s.nearest||'a';render();showToast(`已载入“${s.name}”`)}
function saveSlots(){localStorage.setItem('vocalLabSlots',JSON.stringify(slots))}
function exportCsv(){if(!snapshots.length){showToast('请先保存至少一个构形');return}const cols=['timestamp','preset','voicePack','tongueHeight','tongueFrontness','suprahyoidTension','thyrohyoidTension','jawOpening','lipRounding','larynxHeight','velumOpening','nearestVowel','f0','f1','f2','f3'];const lines=[cols.join(','),...snapshots.map(s=>[s.createdAt,quote(s.name),s.voicePack,...Object.keys(DEFAULT_STATE).map(k=>s.params[k]),s.nearest,s.f0,s.f1,s.f2,s.f3].join(','))];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}));a.download=`声道实验记录_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);showToast('CSV 已导出')}
function quote(v){return `"${String(v).replaceAll('"','""')}"`}

function discardUnsavedVoiceSamples({refreshStatus=true}={}){
  stopSamplePreview();
  for(const vowel of Object.keys(personalSamples)){personalSamples[vowel]=null;clearPreviewSample(vowel)}
  $$('.sample-card').forEach(card=>{card.classList.remove('ready','error');card.querySelector('small').textContent='等待样本';const input=card.querySelector('input');if(input)input.value=''});
  if(refreshStatus)updateVoiceSave();
}

function setupVoiceLab(){
  const grid=$('#sampleGrid');grid.innerHTML=['a','e','i','o','u'].map(v=>`<div class="sample-card" data-vowel="${v}"><strong>[${v}]</strong><small>等待样本</small><div class="sample-actions"><button type="button" class="preview" disabled>试听</button><label>导入<input type="file" accept="audio/wav,.wav,audio/*"></label><button type="button" class="record">录制</button></div></div>`).join('');
  $('#pitchKeyboard').innerHTML=NATURAL_PITCH_MIDIS.map(midi=>{const pitch=pitchFromMidi(midi);return `<button class="pitch-option" type="button" data-midi="${midi}" aria-pressed="${midi===recordingTargetPitch.midi}"><strong>${pitch.solfege}</strong><span>${pitch.note}</span><small>${pitch.hz.toFixed(2)} Hz${pitch.landmark?` · ${pitch.landmark}`:''}</small></button>`}).join('');
  $$('.sample-card input').forEach(input=>input.addEventListener('change',e=>validateSample(e.target.closest('.sample-card').dataset.vowel,e.target.files[0])));$$('.sample-card .record').forEach(btn=>btn.addEventListener('click',()=>recordSample(btn.closest('.sample-card').dataset.vowel,btn)));$$('.sample-card .preview').forEach(btn=>btn.addEventListener('click',()=>playSamplePreview(btn.closest('.sample-card').dataset.vowel,btn)));
  $$('.pitch-option').forEach(button=>button.addEventListener('click',()=>selectRecordingPitch(Number(button.dataset.midi))));
  $('#openVoiceLab').onclick=()=>openVoiceDialog(false);$('#openPitchPicker').onclick=()=>openVoiceDialog(true);$('#openInfo').onclick=()=>$('#infoDialog').showModal();$('#saveVoicePack').onclick=saveVoicePack;$('#exportCurrentVoice').onclick=exportCurrentVoice;$('#playReferencePitch').onclick=()=>playReferencePitch($('#playReferencePitch'));$('#audioSelfTest').onclick=()=>playReferencePitch($('#audioSelfTest'));
  $('#humanOctaveAssist').addEventListener('change',event=>{humanOctaveAssist=event.target.checked;resetPitchDebugForTarget();showToast(humanOctaveAssist?'人声低八度校正已开启':'人声低八度校正已关闭')});
  $('#voiceDialog').addEventListener('close',cancelRecordingSession);
  renderPitchSelection();
}
function openVoiceDialog(focusPitch){const dialog=$('#voiceDialog');dialog.showModal();if(!Object.values(personalSamples).some(Boolean)&&!Object.values(previewSamples).some(Boolean))resetPitchDebugForTarget();if(focusPitch)setTimeout(()=>{$('#pitchPicker').scrollIntoView({block:'center',behavior:'smooth'});$('.pitch-option.active')?.focus()},80)}
function selectRecordingPitch(midi){
  if(midi===recordingTargetPitch.midi){resetPitchDebugForTarget();return}recordingTargetPitch=pitchFromMidi(midi);
  const hadSamples=Object.values(personalSamples).some(Boolean)||Object.values(previewSamples).some(Boolean);discardUnsavedVoiceSamples();render();
  resetPitchDebugForTarget();$('#recordStatus').textContent=`已选择 ${pitchLabel()}。现在五个元音都只能录制这个音高。`;showToast(`${hadSamples?'已清除之前的样本；':''}目标音高已改为 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}`);
}
async function playReferencePitch(button=$('#playReferencePitch')){
  const originalText=button.id==='audioSelfTest'?'声音测试':'播放钢琴参考音';button.disabled=true;button.textContent=`正在播放 ${recordingTargetPitch.solfege}…`;
  const finishTone=tone=>{if(!tone||tone.finished)return;tone.finished=true;for(const oscillator of tone.oscillators||[]){try{oscillator.stop()}catch{}}releaseMediaChannel(tone.ctx);tone.ctx.close().catch(()=>{});tone.button.disabled=false;tone.button.textContent=tone.originalText;tone.button.dataset.audioState='ready';if(referenceTone===tone)referenceTone=null;if(referenceAudioContext===tone.ctx)referenceAudioContext=null;setAudioState(audio?.mode==='personal'?'ready':'',audio?.mode==='personal'?'我的声线已就绪':'等待发声')};
  try{if(referenceTone)finishTone(referenceTone);const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw Error('当前浏览器不支持网页音频');const ctx=new AudioContextClass({latencyHint:'interactive'}),mainGain=ctx.createGain(),tone={ctx,oscillators:[],button,originalText,finished:false};referenceAudioContext=ctx;referenceTone=tone;
  const referenceFrequency=PitchCore.midiToFrequency(recordingTargetPitch.midi),partials=[[1,1],[2.002,.5],[3.006,.26],[4.012,.14],[5.02,.075],[6.03,.04]];for(const [ratio,level] of partials){const oscillator=ctx.createOscillator(),partialGain=ctx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(referenceFrequency*ratio,ctx.currentTime);partialGain.gain.value=level;oscillator.connect(partialGain).connect(mainGain);tone.oscillators.push(oscillator)}await routeToMediaChannel(ctx,mainGain,'声道实验台钢琴参考音');if(tone.finished)return;const now=ctx.currentTime+.03,duration=2.35;
  updatePitchDebug({rawFrequency:referenceFrequency,correctedFrequency:referenceFrequency,confidence:1,source:`钢琴式参考音 · ${recordingTargetPitch.note} 基频实际值`,sampleRate:ctx.sampleRate,duration,detector:'Web Audio 钢琴式谐波音色（非录音检测）'});mainGain.gain.setValueAtTime(.0001,now);mainGain.gain.exponentialRampToValueAtTime(.17,now+.012);mainGain.gain.exponentialRampToValueAtTime(.07,now+.55);mainGain.gain.exponentialRampToValueAtTime(.025,now+1.85);mainGain.gain.exponentialRampToValueAtTime(.0001,now+duration);for(const oscillator of tone.oscillators){oscillator.start(now);oscillator.stop(now+duration)}button.dataset.audioState='playing';setAudioState('playing',`钢琴参考音 ${recordingTargetPitch.note} · 基频 ${referenceFrequency.toFixed(4)} Hz`);tone.oscillators[0].onended=()=>finishTone(tone)}catch(err){console.error('Reference pitch failed.',err);if(referenceTone)finishTone(referenceTone);button.disabled=false;button.textContent='重新测试声音';button.dataset.audioState='error';setAudioState('error','参考音播放失败');showToast('参考音未能播放：请调高媒体音量后重试')}
}
function median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2}
function normalizedCorrelation(frame,lag){let sum=0,first=0,second=0;for(let i=0;i<frame.length-lag;i++){const a=frame[i],b=frame[i+lag];sum+=a*b;first+=a*a;second+=b*b}return sum/Math.sqrt(first*second+1e-12)}
function spectralEnergy(frame,sampleRate,frequency){let real=0,imaginary=0;const step=2*Math.PI*frequency/sampleRate;for(let i=0;i<frame.length;i++){const phase=step*i,value=frame[i];real+=value*Math.cos(phase);imaginary-=value*Math.sin(phase)}return (real*real+imaginary*imaginary)/(frame.length*frame.length)}
function mcleodPitch(frame,sampleRate,minLag,maxLag){
  const nsdf=new Float64Array(maxLag+1);for(let lag=0;lag<=maxLag;lag++){let acf=0,energy=0;for(let i=0;i<frame.length-lag;i++){const first=frame[i],second=frame[i+lag];acf+=first*second;energy+=first*first+second*second}nsdf[lag]=energy>1e-12?2*acf/energy:0}
  const peaks=[];let position=Math.max(1,minLag);while(position<=maxLag){while(position<=maxLag&&nsdf[position]<=0)position++;if(position>maxLag)break;let peak=position;while(position<=maxLag&&nsdf[position]>0){if(nsdf[position]>nsdf[peak])peak=position;position++}if(peak>=minLag)peaks.push(peak)}if(!peaks.length)return null;
  const strongest=Math.max(...peaks.map(peak=>nsdf[peak]));if(strongest<.55)return null;const selected=peaks.find(peak=>nsdf[peak]>=strongest*.9)||peaks[0],left=nsdf[Math.max(minLag,selected-1)],center=nsdf[selected],right=nsdf[Math.min(maxLag,selected+1)],denominator=left-2*center+right,offset=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0,period=selected+offset;return {frequency:sampleRate/period,clarity:Math.max(0,Math.min(1,center))};
}
function estimateFramePitch(frame,sampleRate,minLag,maxLag,minFrequency,maxFrequency,expectedFrequency=null){
  const difference=new Float64Array(maxLag+1),normalized=new Float64Array(maxLag+1);for(let lag=1;lag<=maxLag;lag++){let sum=0;for(let i=0;i<frame.length-lag;i++){const delta=frame[i]-frame[i+lag];sum+=delta*delta}difference[lag]=sum}
  let running=0;normalized[0]=1;for(let lag=1;lag<=maxLag;lag++){running+=difference[lag];normalized[lag]=running?difference[lag]*lag/running:1}
  let rawLag=0;for(let lag=minLag;lag<maxLag;lag++){if(normalized[lag]<.16){while(lag+1<=maxLag&&normalized[lag+1]<normalized[lag])lag++;rawLag=lag;break}}
  if(!rawLag){let bestValue=1;for(let lag=minLag;lag<=maxLag;lag++)if(normalized[lag]<bestValue){bestValue=normalized[lag];rawLag=lag}if(bestValue>.32)return null}
  const left=normalized[Math.max(minLag,rawLag-1)],center=normalized[rawLag],right=normalized[Math.min(maxLag,rawLag+1)],denominator=left-2*center+right,offset=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0,yinFrequency=sampleRate/(rawLag+offset),mcleod=mcleodPitch(frame,sampleRate,minLag,maxLag),rawFrequency=mcleod?.frequency||yinFrequency,candidates=[yinFrequency/2,yinFrequency,yinFrequency*2,mcleod?.frequency/2,mcleod?.frequency,mcleod?.frequency*2].filter(frequency=>Number.isFinite(frequency)&&frequency>=minFrequency&&frequency<=maxFrequency).filter((frequency,index,all)=>all.findIndex(value=>Math.abs(1200*Math.log2(value/frequency))<8)===index);
  const details=candidates.map(frequency=>{const lag=Math.max(minLag,Math.min(maxLag,Math.round(sampleRate/frequency))),correlation=Math.max(0,normalizedCorrelation(frame,lag)),yinQuality=Math.max(0,1-normalized[lag]),energies=[];for(let harmonic=1;harmonic<=8&&frequency*harmonic<sampleRate/2;harmonic++){let energy=0;for(const scale of [.992,.996,1,1.004,1.008])energy=Math.max(energy,spectralEnergy(frame,sampleRate,frequency*harmonic*scale));energies.push(energy)}const fundamental=energies[0]||0,subharmonic=frequency/2>=minFrequency?spectralEnergy(frame,sampleRate,frequency/2):0;let harmonics=0,oddEnergy=fundamental,evenEnergy=0;for(let harmonic=2;harmonic<=energies.length;harmonic++){const weighted=energies[harmonic-1]/Math.pow(harmonic,.7);harmonics+=weighted;if(harmonic%2)oddEnergy+=weighted;else evenEnergy+=weighted}const oddEvenRatio=oddEnergy/(evenEnergy+1e-12),targetCents=expectedFrequency?Math.abs(1200*Math.log2(frequency/expectedFrequency)):Infinity,mcleodCents=mcleod?Math.abs(1200*Math.log2(frequency/mcleod.frequency)):Infinity;return {frequency,correlation,yinQuality,fundamental,subharmonic,harmonics,oddEnergy,evenEnergy,oddEvenRatio,targetCents,mcleodCents}});
  const maxFundamental=Math.max(...details.map(detail=>detail.fundamental),1e-12),maxHarmonics=Math.max(...details.map(detail=>detail.harmonics),1e-12);details.forEach(detail=>{const fundamentalSupport=detail.fundamental/maxFundamental,harmonicSupport=detail.harmonics/maxHarmonics,octavePenalty=detail.subharmonic/(detail.fundamental+detail.subharmonic+1e-12),missingOddPenalty=Math.max(0,(.12-detail.oddEvenRatio)/.12),targetTieBreaker=detail.correlation>.62&&detail.yinQuality>.6?.06*Math.exp(-.5*Math.pow(detail.targetCents/70,2)):0,mcleodSupport=(mcleod?.clarity||0)*.24*Math.exp(-.5*Math.pow(detail.mcleodCents/35,2));detail.score=.28*detail.correlation+.22*detail.yinQuality+.17*fundamentalSupport+.11*harmonicSupport+mcleodSupport-.17*octavePenalty-.16*missingOddPenalty+targetTieBreaker;detail.confidence=Math.max(0,Math.min(1,.38*detail.correlation+.25*detail.yinQuality+.27*(mcleod?.clarity||0)+.10*Math.min(1,detail.oddEvenRatio/.2)))});
  let selected=details.reduce((best,detail)=>detail.score>best.score?detail:best),octaveCorrection='none';if(expectedFrequency&&selected.frequency<expectedFrequency*.62&&selected.frequency>expectedFrequency*.42){const targetCandidate=details.reduce((best,detail)=>detail.targetCents<best.targetCents?detail:best),octaveDistance=Math.abs(1200*Math.log2(targetCandidate.frequency/(selected.frequency*2))),targetEnergyRatio=targetCandidate.fundamental/(selected.fundamental+1e-12),lowOddShare=selected.oddEnergy/(selected.oddEnergy+selected.evenEnergy+1e-12),hasSpectralEvidence=targetEnergyRatio>1.65||lowOddShare<.16,hasPeriodEvidence=targetCandidate.correlation>.42&&targetCandidate.yinQuality>.42;if(targetCandidate.targetCents<70&&octaveDistance<45&&hasSpectralEvidence&&hasPeriodEvidence&&targetCandidate.score>selected.score-.38){selected=targetCandidate;selected.confidence=Math.min(selected.confidence,.92);octaveCorrection=`spectral ${targetEnergyRatio.toFixed(2)}x · odd ${(lowOddShare*100).toFixed(0)}%`}}
  return {rawFrequency,frequency:selected.frequency,confidence:selected.confidence,score:selected.score,mcleodFrequency:mcleod?.frequency||0,yinFrequency,octaveCorrection};
}
function estimateF0(data,sampleRate,expectedFrequency=null){
  const frameSize=Math.min(4096,2**Math.floor(Math.log2(Math.max(2048,data.length/6)))),minFrequency=65,maxFrequency=1200,minLag=Math.max(2,Math.floor(sampleRate/maxFrequency)),maxLag=Math.min(frameSize>>1,Math.ceil(sampleRate/minFrequency)),frames=[];
  for(const position of [.28,.39,.5,.61,.72]){const start=Math.max(0,Math.min(data.length-frameSize,Math.floor(data.length*position-frameSize/2))),frame=new Float32Array(frameSize);let mean=0;for(let i=0;i<frameSize;i++)mean+=data[start+i]||0;mean/=frameSize;for(let i=0;i<frameSize;i++)frame[i]=(data[start+i]||0)-mean;const result=estimateFramePitch(frame,sampleRate,minLag,maxLag,minFrequency,maxFrequency,expectedFrequency);if(result)frames.push(result)}
  if(frames.length<3)throw Error('未识别到稳定音高，请保持一个清晰、单一的持续元音');const provisional=median(frames.map(frame=>frame.frequency)),stable=frames.filter(frame=>Math.abs(1200*Math.log2(frame.frequency/provisional))<70);if(stable.length<3)throw Error('音高波动较大，请保持一个稳定长音');return {rawFrequency:median(stable.map(frame=>frame.rawFrequency)),frequency:median(stable.map(frame=>frame.frequency)),confidence:stable.reduce((sum,frame)=>sum+frame.confidence,0)/stable.length,frameCount:stable.length,mcleodFrequency:median(stable.map(frame=>frame.mcleodFrequency)),yinFrequency:median(stable.map(frame=>frame.yinFrequency)),octaveCorrection:stable.find(frame=>frame.octaveCorrection!=='none')?.octaveCorrection||'none'};
}
function runPitchDetectionSelfTests(coreResult=runPitchCoreTests()){
  const results=[],synthesize=(frequency,sampleRate,weights)=>{const length=Math.floor(sampleRate*.9),signal=new Float32Array(length);for(let i=0;i<length;i++){const time=i/sampleRate,envelope=Math.min(1,i/(sampleRate*.03),(length-i)/(sampleRate*.03));signal[i]=envelope*weights.reduce((sum,weight,index)=>sum+weight*Math.sin(2*Math.PI*frequency*(index+1)*time),0)}return signal},test=(name,midi,sampleRate,weights,targetMidi=midi)=>{const expected=PitchCore.midiToPitch(midi),signal=synthesize(expected.hz,sampleRate,weights),detected=estimateF0(signal,sampleRate,PitchCore.midiToFrequency(targetMidi)),cents=1200*Math.log2(detected.frequency/expected.hz);results.push({name,pass:Math.abs(cents)<25,expected:expected.hz,detected:detected.frequency,cents:Number(cents.toFixed(1)),mcleod:detected.mcleodFrequency,yin:detected.yinFrequency})};
  for(const midi of [48,60,72])test(`强第二谐波人声 ${PitchCore.midiToPitch(midi).note}`,midi,48000,[.2,.5,.25,.14,.09]);
  test('真实 C3 不因目标 C4 被强制升八度',48,48000,[.2,.5,.25,.14,.09],60);
  test('弱基频 C4 仍识别为 C4',60,48000,[.035,.56,.24,.13,.08,.05]);
  test('44.1 kHz 录音中的 C4 仍识别为 C4',60,44100,[.12,.48,.25,.14,.09]);
  {const sampleRate=48000,frequency=PitchCore.midiToFrequency(62),length=Math.floor(sampleRate*.9),signal=new Float32Array(length);for(let i=0;i<length;i++){const time=i/sampleRate;signal[i]=.055*Math.sin(Math.PI*frequency*time)+.58*Math.sin(2*Math.PI*frequency*time)+.25*Math.sin(4*Math.PI*frequency*time)+.12*Math.sin(6*Math.PI*frequency*time)}const detected=estimateF0(signal,sampleRate,frequency),cents=1200*Math.log2(detected.frequency/frequency);results.push({name:'含微弱半频周期的 D4 仍识别为 D4',pass:Math.abs(cents)<25,expected:frequency,detected:detected.frequency,cents:Number(cents.toFixed(1))})}
  {const c3=PitchCore.midiToFrequency(48),c4=PitchCore.midiToFrequency(60),raised=applyHumanOctaveAssist(c3,c4,true),kept=applyHumanOctaveAssist(c3,c3,true),unrelated=applyHumanOctaveAssist(PitchCore.midiToFrequency(55),c4,true);results.push({name:'目标 C4 时 130.81 Hz 可见校正为 261.63 Hz',pass:raised.applied&&Math.abs(raised.frequency-c4)<.02,expected:c4,detected:raised.frequency});results.push({name:'目标 C3 时真实 C3 不升八度',pass:!kept.applied&&Math.abs(kept.frequency-c3)<.02,expected:c3,detected:kept.frequency});results.push({name:'非一倍八度偏差不会被强制校正',pass:!unrelated.applied,expected:c4,detected:unrelated.frequency})}
  const all=[...coreResult.results,...results],passed=all.filter(result=>result.pass).length,status=$('#pitchTestStatus');if(status){status.textContent=`科学音高与人声谐波自动测试：${passed}/${all.length} ${passed===all.length?'全部通过':'存在失败'}`;status.dataset.state=passed===all.length?'passed':'failed'}console.table(results);return {passed,total:all.length,results:all};
}
function lpcCoefficients(frame,order){
  const r=new Float64Array(order+1);for(let lag=0;lag<=order;lag++){let sum=0;for(let i=lag;i<frame.length;i++)sum+=frame[i]*frame[i-lag];r[lag]=sum}
  if(r[0]<1e-8)throw Error('录音能量过低');const a=new Float64Array(order+1);a[0]=1;let error=r[0];
  for(let i=1;i<=order;i++){let acc=r[i];for(let j=1;j<i;j++)acc+=a[j]*r[i-j];const reflection=-acc/Math.max(error,1e-12),previous=a.slice();a[i]=reflection;for(let j=1;j<i;j++)a[j]=previous[j]+reflection*previous[i-j];error*=Math.max(.001,1-reflection*reflection)}return a;
}
function estimateFormants(data,sampleRate,vowel,f0){
  const size=Math.min(8192,data.length),start=Math.max(0,Math.floor(data.length*.5-size/2)),frame=new Float64Array(size);let previous=0;
  for(let i=0;i<size;i++){const raw=data[start+i]||0,emphasized=raw-.97*previous;previous=raw;frame[i]=emphasized*(.54-.46*Math.cos(2*Math.PI*i/(size-1)))}
  const order=sampleRate>=40000?22:18,a=lpcCoefficients(frame,order),spectrum=[];
  for(let hz=150;hz<=4000;hz+=10){const omega=2*Math.PI*hz/sampleRate;let real=1,imag=0;for(let k=1;k<a.length;k++){real+=a[k]*Math.cos(-omega*k);imag+=a[k]*Math.sin(-omega*k)}spectrum.push({hz,power:1/Math.sqrt(real*real+imag*imag+1e-12)})}
  const peaks=spectrum.filter((p,i)=>i>0&&i<spectrum.length-1&&p.power>spectrum[i-1].power&&p.power>=spectrum[i+1].power),scale=f0<175?.9:f0<210?.96:1,expected=VOWELS[vowel];
  const choose=(target,min,max,width,after=0)=>{const candidates=peaks.filter(p=>p.hz>=Math.max(min,after)&&p.hz<=max);if(!candidates.length)return target;return candidates.reduce((best,p)=>Math.log(p.power+1e-9)-Math.abs(p.hz-target)/width>Math.log(best.power+1e-9)-Math.abs(best.hz-target)/width?p:best).hz};
  const f1=choose(expected.f1*scale,180,1150,180),f2=choose(expected.f2*scale,Math.max(500,f1+260),3100,340,f1+260),f3=choose(expected.f3*scale,Math.max(1500,f2+300),3900,440,f2+300);
  return {f1:Math.round(f1),f2:Math.round(f2),f3:Math.round(f3)};
}
function applyHumanOctaveAssist(frequency,expectedFrequency,enabled=humanOctaveAssist){const raised=frequency*2,cents=1200*Math.log2(raised/expectedFrequency),applied=enabled&&Math.abs(cents)<=90;return {frequency:applied?raised:frequency,applied,cents}}
function analyzeVoiceSample(buffer,vowel,expectedFrequency=recordingTargetPitch.hz){const data=buffer.getChannelData(0),pitch=estimateF0(data,buffer.sampleRate,expectedFrequency),assist=applyHumanOctaveAssist(pitch.frequency,expectedFrequency),f0=assist.frequency,formants=estimateFormants(data,buffer.sampleRate,vowel,f0),octaveCorrection=assist.applied?'target-octave-assist+1':pitch.octaveCorrection;return {f0:Number(f0.toFixed(2)),rawFrequency:Number(pitch.frequency.toFixed(2)),correctedFrequency:Number(f0.toFixed(2)),mcleodFrequency:Number(pitch.mcleodFrequency.toFixed(2)),yinFrequency:Number(pitch.yinFrequency.toFixed(2)),octaveCorrection,pitchConfidence:Number(pitch.confidence.toFixed(3)),pitchFrames:pitch.frameCount,sampleRate:buffer.sampleRate,...formants}}
function buildPersonalAnalysis(samples,targetPitch=recordingTargetPitch){
  const vowels={};for(const [v,sample] of Object.entries(samples)){const measured=sample.analysis,base=VOWELS[v],preset=VOWEL_PRESETS[v],f1Delta=measured.f1-base.f1,f2Delta=measured.f2-base.f2,f3Delta=measured.f3-base.f3;vowels[v]={...measured,params:{...preset,tongueHeight:clamp(preset.tongueHeight-f1Delta/6),jawOpening:clamp(preset.jawOpening+f1Delta/8),tongueFrontness:clamp(preset.tongueFrontness+f2Delta/22),lipRounding:clamp(preset.lipRounding-f2Delta/28),larynxHeight:clamp(preset.larynxHeight+f3Delta/25)}}}return {f0:Number(median(Object.values(vowels).map(v=>v.f0)).toFixed(2)),targetPitch:{...targetPitch},vowels,method:'McLeod MPM + YIN + 奇偶谐波频谱证据 + 可见的目标八度辅助；浏览器 LPC 教学估计',pitchAlgorithm:'mcleod-yin-octave-assist-v8'};
}
function stopSamplePreview(){if(!previewAudio)return;const {element,button}=previewAudio;try{element.pause();element.src=''}catch{}if(button){button.textContent='试听';button.classList.remove('playing')}previewAudio=null}
function setPreviewSample(vowel,file){stopSamplePreview();const previous=previewSamples[vowel];if(previous?.url)URL.revokeObjectURL(previous.url);const url=URL.createObjectURL(file);previewSamples[vowel]={blob:file,url};const button=$(`.sample-card[data-vowel="${vowel}"] .preview`);if(button){button.disabled=false;button.textContent='试听'}}
async function playSamplePreview(vowel,button){
  const sample=previewSamples[vowel];if(!sample)return;if(previewAudio?.button===button){stopSamplePreview();return}stopSamplePreview();const element=new Audio(sample.url);element.setAttribute('playsinline','');element.setAttribute('webkit-playsinline','');previewAudio={element,button};button.textContent='停止';button.classList.add('playing');element.onended=stopSamplePreview;element.onerror=()=>{stopSamplePreview();showToast('这段录音暂时无法播放，请重新录制或导入')};try{await element.play()}catch(err){console.error('Sample preview failed.',err);stopSamplePreview();showToast('试听未能开始，请调高媒体音量后重试')}
}
function clearPreviewSample(vowel){const sample=previewSamples[vowel];if(sample?.url)URL.revokeObjectURL(sample.url);previewSamples[vowel]=null;const button=$(`.sample-card[data-vowel="${vowel}"] .preview`);if(button){button.disabled=true;button.textContent='试听'}}
async function validateSample(vowel,file){
  const card=$(`.sample-card[data-vowel="${vowel}"]`),msg=card.querySelector('small');card.classList.remove('ready','error');if(!file)return;
  personalSamples[vowel]=null;setPreviewSample(vowel,file);
  try{const ownsContext=!audio?.ctx,ctx=audio?.ctx||new (window.AudioContext||window.webkitAudioContext)(),buffer=await ctx.decodeAudioData(await file.arrayBuffer()),duration=buffer.duration,data=buffer.getChannelData(0);let peak=0,rms=0;for(let i=0;i<data.length;i+=8){peak=Math.max(peak,Math.abs(data[i]));rms+=data[i]*data[i]}rms=Math.sqrt(rms/(data.length/8));if(duration<2.5||duration>7)throw Error(`时长 ${duration.toFixed(1)} 秒，请保持 3–6 秒后重新录制`);if(peak>.995)throw Error('检测到削波，请降低录音音量后重新录制');if(rms<.015)throw Error('音量过低或背景过静，请靠近麦克风重新录制');msg.textContent='正在用 MPM + YIN 分析真实音高与共振峰…';await new Promise(resolve=>setTimeout(resolve));const analysis=analyzeVoiceSample(buffer,vowel,recordingTargetPitch.hz),pitchCents=Math.round(1200*Math.log2(analysis.f0/recordingTargetPitch.hz)),detected=PitchCore.frequencyToPitch(analysis.f0),correction=analysis.octaveCorrection==='target-octave-assist+1'?' · 已按所选目标校正 +1 八度':analysis.octaveCorrection!=='none'?` · 八度证据 ${analysis.octaveCorrection}`:'';updatePitchDebug({rawFrequency:analysis.rawFrequency,correctedFrequency:analysis.correctedFrequency,confidence:analysis.pitchConfidence,source:`真人录音 [${vowel}] · ${analysis.pitchFrames} 个稳定帧`,sampleRate:analysis.sampleRate,duration,detector:`MPM ${analysis.mcleodFrequency.toFixed(2)} Hz + YIN ${analysis.yinFrequency.toFixed(2)} Hz${correction}`});if(Math.abs(pitchCents)>50){const octaves=Math.round(pitchCents/1200),octaveHint=Math.abs(octaves)===1?`，即${octaves>0?'高':'低'}一个八度`:'';throw Error(`实际检测为 ${detected.note}（${analysis.f0.toFixed(2)} Hz），与所选 ${recordingTargetPitch.note} 相差 ${pitchCents>0?'+':''}${pitchCents} 音分${octaveHint}`)}analysis.referencePitchCents=pitchCents;analysis.targetMidi=recordingTargetPitch.midi;personalSamples[vowel]={blob:file,buffer,duration,peak,rms,analysis};if(ownsContext)ctx.close().catch(()=>{});card.classList.add('ready');msg.textContent=`${duration.toFixed(1)} 秒 · 检测 ${detected.note} ${analysis.f0.toFixed(2)} Hz · 置信度 ${analysis.pitchConfidence.toFixed(2)} · 偏差 ${pitchCents>0?'+':''}${pitchCents} 音分 · F1 ${analysis.f1} · F2 ${analysis.f2}`;updateVoiceSave()}catch(err){personalSamples[vowel]=null;card.classList.add('error');msg.textContent=`${err.message}；本段仍可试听，重新录制或导入会替换`;updateVoiceSave()}
}
let recorder=null,recordChunks=[],recordTimer=null,recordClock=null,recordingStartedAt=0,recordStream=null,recordButton=null,recordingPhase='idle',recordingToken=0,discardRecording=false,recordingMeter=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setRecordingMonitor(state,title,time='00:00.0',level='麦克风尚未启用'){
  const monitor=$('#recordingMonitor');if(!monitor)return;monitor.dataset.state=state;$('#recordingTitle').textContent=title;$('#recordingTime').textContent=time;$('#recordingLevelText').textContent=level;
}
function setRecordButtons(active,text){$$('.sample-card .record').forEach(button=>{button.disabled=Boolean(active)&&button!==active;if(button===active&&text)button.textContent=text;else if(!active)button.textContent='录制'})}
function formatRecordingTime(ms){const total=Math.max(0,ms)/1000,minutes=Math.floor(total/60),seconds=Math.floor(total%60),tenths=Math.floor((total%1)*10);return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${tenths}`}
function startRecordingMeter(stream){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext,canvas=$('#recordingWaveform');if(!AudioContextClass||!canvas)return;
  const ctx=new AudioContextClass(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(),data=new Uint8Array(512),drawCtx=canvas.getContext('2d');analyser.fftSize=1024;analyser.smoothingTimeConstant=.72;source.connect(analyser);
  const draw=()=>{const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,canvas.clientWidth*dpr),h=Math.max(1,canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}analyser.getByteTimeDomainData(data);let energy=0;for(const sample of data){const normalized=(sample-128)/128;energy+=normalized*normalized}const rms=Math.sqrt(energy/data.length),level=Math.min(1,rms*5.2);drawCtx.clearRect(0,0,w,h);drawCtx.fillStyle='#07141c';drawCtx.fillRect(0,0,w,h);drawCtx.strokeStyle=recordingPhase==='recording'?'#ff647c':'#ffd166';drawCtx.lineWidth=2*dpr;drawCtx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*w,y=h/2+(data[i]-128)/128*(h*.42);i?drawCtx.lineTo(x,y):drawCtx.moveTo(x,y)}drawCtx.stroke();drawCtx.fillStyle=recordingPhase==='recording'?'rgba(255,100,124,.24)':'rgba(255,209,102,.2)';drawCtx.fillRect(0,h-6*dpr,w*level,6*dpr);$('#recordingLevelText').textContent=level<.07?'音量偏低':level>.82?'音量较大':'音量合适';recordingMeter.raf=requestAnimationFrame(draw)};
  recordingMeter={ctx,source,analyser,raf:requestAnimationFrame(draw)};
}
function stopRecordingMeter(){if(!recordingMeter)return;cancelAnimationFrame(recordingMeter.raf);try{recordingMeter.source.disconnect();recordingMeter.ctx.close()}catch{}recordingMeter=null;const canvas=$('#recordingWaveform'),ctx=canvas?.getContext('2d');if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height)}}
function cleanupRecordingMedia(){clearTimeout(recordTimer);clearInterval(recordClock);recordTimer=null;recordClock=null;recordStream?.getTracks().forEach(track=>track.stop());recordStream=null;stopRecordingMeter()}
function resetRecordingUi({refreshStatus=true}={}){recordingPhase='idle';recorder=null;recordButton=null;setRecordButtons(null);setRecordingMonitor('idle','等待录音');if(refreshStatus)updateVoiceSave()}
function cancelRecordingSession(){
  if(recordingPhase==='idle')return;recordingToken++;discardRecording=true;
  if(recorder?.state==='recording'){recorder.stop()}else{cleanupRecordingMedia();resetRecordingUi()}
}
async function recordSample(vowel,button){
  if(recordingPhase==='recording'){if(button===recordButton){button.disabled=true;button.textContent='正在结束…';recorder.stop()}return}
  if(recordingPhase==='requesting'||recordingPhase==='countdown'){cancelRecordingSession();$('#recordStatus').textContent='已取消本次录音准备。';return}
  if(recordingPhase!=='idle')return;
  stopSamplePreview();personalSamples[vowel]=null;clearPreviewSample(vowel);const card=$(`.sample-card[data-vowel="${vowel}"]`);card.classList.remove('ready','error');card.querySelector('small').textContent='准备重新录制…';updateVoiceSave();const token=++recordingToken;recordingPhase='requesting';recordButton=button;discardRecording=false;setRecordButtons(button,'取消');setRecordingMonitor('requesting',`正在请求麦克风 · [${vowel}]`,'00:00.0','请允许麦克风权限');$('#recordStatus').textContent='正在请求麦克风权限；允许后会先倒计时 3 秒，再正式录音。';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('当前浏览器不支持麦克风录音');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});if(token!==recordingToken){stream.getTracks().forEach(track=>track.stop());return}recordStream=stream;startRecordingMeter(stream);recordingPhase='countdown';
    for(let count=3;count>=1;count--){if(token!==recordingToken)return;setRecordButtons(button,`取消 · ${count}`);setRecordingMonitor('countdown',`${count} 秒后开始 · 准备 [${vowel}]`,'00:00.0','现在可以调整距离与音量');$('#recordStatus').textContent=`准备录制 [${vowel}]：${count} 秒后开始，请唱 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}。`;await wait(900)}
    if(token!==recordingToken)return;
    recordChunks=[];const activeRecorder=new MediaRecorder(stream);recorder=activeRecorder;activeRecorder.ondataavailable=event=>{if(event.data?.size)recordChunks.push(event.data)};activeRecorder.onerror=()=>{$('#recordStatus').textContent='录音中断，请重新尝试。'};
    activeRecorder.onstop=async()=>{const shouldDiscard=discardRecording||token!==recordingToken,mime=activeRecorder.mimeType||'audio/webm',extension=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';cleanupRecordingMedia();recordingPhase=shouldDiscard?'idle':'processing';setRecordingMonitor(shouldDiscard?'idle':'processing',shouldDiscard?'等待录音':`正在检查 [${vowel}]`,formatRecordingTime(performance.now()-recordingStartedAt),shouldDiscard?'麦克风已关闭':'正在分析音高与共振峰');if(shouldDiscard){resetRecordingUi();return}setRecordButtons(button,'分析中…');$('#recordStatus').textContent=`[${vowel}] 已停止录音，正在检查时长、音高与声音质量…`;await validateSample(vowel,new File(recordChunks,`${vowel}.${extension}`,{type:mime}));const card=$(`.sample-card[data-vowel="${vowel}"]`),error=card.classList.contains('error'),detail=card.querySelector('small').textContent;resetRecordingUi({refreshStatus:false});$('#recordStatus').textContent=error?`[${vowel}] 未保存：${detail}`:`[${vowel}] 录制检查通过；目标 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}。`};
    activeRecorder.start(200);recordingPhase='recording';recordingStartedAt=performance.now();setRecordButtons(button,'停止录音');setRecordingMonitor('recording',`正在录制 [${vowel}]`,'00:00.0','正在监听音量');$('#recordStatus').textContent=`● 正在录制 [${vowel}]：只唱 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}，保持 3–6 秒。再次点击即可停止。`;
    recordClock=setInterval(()=>$('#recordingTime').textContent=formatRecordingTime(performance.now()-recordingStartedAt),100);recordTimer=setTimeout(()=>activeRecorder.state==='recording'&&activeRecorder.stop(),6000);
  }catch(err){console.error('Microphone recording failed.',err);cleanupRecordingMedia();resetRecordingUi();setRecordingMonitor('error','无法开始录音','00:00.0','请检查麦克风权限');$('#recordStatus').textContent=`无法使用麦克风：${err.message||'请检查浏览器权限，或改用文件导入。'}`}
}
function updateVoiceSave(){
  const ready=Object.entries(personalSamples).filter(([,sample])=>Boolean(sample)).map(([vowel])=>vowel),missing=Object.keys(personalSamples).filter(vowel=>!personalSamples[vowel]),button=$('#saveVoicePack');
  button.disabled=ready.length!==5;
  if(recordingPhase!=='idle')return;
  if(ready.length===5){const f0=Math.round(median(Object.values(personalSamples).map(sample=>sample.analysis.f0))),cents=Math.round(1200*Math.log2(f0/recordingTargetPitch.hz));$('#recordStatus').textContent=`五个元音已完成 · 目标 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note} · 中位 F0 ${f0} Hz · 偏差 ${cents>0?'+':''}${cents} 音分；可以保存。`}else $('#recordStatus').textContent=`已分析 ${ready.length}/5；目标 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}；还需要：${missing.map(v=>`[${v}]`).join(' ')}`;
}
async function saveVoicePack(){
  const button=$('#saveVoicePack'),missing=Object.keys(personalSamples).filter(v=>!personalSamples[v]);
  if(missing.length){$('#recordStatus').textContent=`还缺少：${missing.map(v=>`[${v}]`).join(' ')}`;return}
  const id=`personal-${Date.now()}`,name=$('#packName').value.trim()||`我的声线 ${personalVoicePacks.size+1}`,analysis=buildPersonalAnalysis(personalSamples),manifest={id,name,createdAt:new Date().toISOString(),f0:analysis.f0,source:'local',analysis,vowels:{}},records=[];
  for(const [v,s] of Object.entries(personalSamples)){manifest.vowels[v]={duration:s.duration,type:s.blob.type||'audio/wav',size:s.blob.size,analysis:s.analysis};records.push({id:`${id}-${v}`,packId:id,vowel:v,blob:s.blob,duration:s.duration,analysis:s.analysis})}
  button.disabled=true;button.textContent='正在保存…';$('#recordStatus').textContent='正在保存到这台设备，请稍候…';
  try{await dbSaveVoicePack(manifest,records)}catch(err){console.error('Voice pack save failed.',err);button.textContent='保存声线';button.disabled=false;$('#recordStatus').textContent='保存失败：浏览器未能写入本机存储。请确认没有使用无痕模式，并为此页面允许站点数据。';showToast('个人声线保存失败，录音仍保留在当前窗口');return}
  addVoiceOption(manifest,{select:true});Object.assign(state,vowelPreset(state.currentVowel));button.textContent='保存声线';$('#voiceDialog').close();showToast(`“${name}”已新增；现在共有 ${personalVoicePacks.size} 套个人声线`);
  if(audio){try{stopAndClearAudio();await loadVoicePack(id)}catch(err){console.warn('Saved voice pack could not be loaded immediately.',err);setAudioState('error','声线已保存 · 载入失败');showToast('声线已保存；重新选择该声线即可再次载入')}}
  discardUnsavedVoiceSamples();$('#packName').value=`我的声线 ${personalVoicePacks.size+1}`;
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function exportCurrentVoice(){const pack=personalVoicePacks.get(state.voicePackId);if(!pack){showToast('当前还没有可导出的个人声线');return}if(pack.source==='bundled'){showToast('初始声线已经随网站提供，无需再次导出');return}const button=$('#exportCurrentVoice');button.disabled=true;button.textContent='正在导出…';try{const records=(await dbAll('voiceSamples')).filter(record=>record.packId===pack.id);if(records.length!==5)throw Error('当前声线的五个元音样本不完整');const samples=[];for(const record of records)samples.push({id:record.id,packId:record.packId,vowel:record.vowel,duration:record.duration,analysis:record.analysis,type:record.blob.type||'audio/webm',data:await blobToDataUrl(record.blob)});const payload={format:'vocal-tract-lab-voice-pack',version:1,exportedAt:new Date().toISOString(),pack,samples},link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));link.download=`${pack.name.replace(/[\\/:*?"<>|]/g,'_')}.vocalpack.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);showToast(`已导出“${pack.name}”的五个元音`)}catch(err){console.error('Voice export failed.',err);showToast(`导出失败：${err.message}`)}finally{button.disabled=false;button.textContent='导出当前声线'}}
async function loadVoicePack(id){
  const pack=personalVoicePacks.get(id);if(!pack)throw Error('找不到所选声线');if(!audio)await initAudio();clearAudioVoices();
  if(pack.source==='bundled'){
    for(const [vowel,item] of Object.entries(pack.vowels)){let encoded;if(item.audioPath.startsWith('data:')){const base64=item.audioPath.slice(item.audioPath.indexOf(',')+1),binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);encoded=bytes.buffer}else{const response=await fetch(item.audioPath);if(!response.ok)throw Error(`初始声线 [${vowel}] 加载失败`);encoded=await response.arrayBuffer()}const buffer=await audio.ctx.decodeAudioData(encoded);createLoopSource(vowel,buffer)}
  }else{
    const records=(await dbAll('voiceSamples')).filter(r=>r.packId===id);if(records.length!==5)throw Error('个人声线样本不完整');const needsPitchUpgrade=pack.analysis?.pitchAlgorithm!=='mcleod-yin-octave-assist-v8',targetPitch=pack.analysis?.targetPitch||pitchFromMidi(60),recalibrated={};let upgradeFailed=false;
    for(const r of records){const buffer=await audio.ctx.decodeAudioData(await r.blob.arrayBuffer());if(needsPitchUpgrade&&!upgradeFailed){try{r.analysis=analyzeVoiceSample(buffer,r.vowel,targetPitch.hz);recalibrated[r.vowel]={analysis:r.analysis}}catch(err){upgradeFailed=true;console.warn('Existing voice pitch recalibration was skipped.',err)}}createLoopSource(r.vowel,buffer)}
    if(needsPitchUpgrade&&!upgradeFailed&&Object.keys(recalibrated).length===5){pack.analysis=buildPersonalAnalysis(recalibrated,targetPitch);pack.f0=pack.analysis.f0;for(const [vowel,sample] of Object.entries(recalibrated))if(pack.vowels?.[vowel])pack.vowels[vowel].analysis=sample.analysis;await dbSaveVoicePack(pack,records);personalVoicePacks.set(pack.id,pack);showToast(`“${pack.name}”已用新版人声八度消歧算法重新校准`)}
  }
  audio.mode='personal';setAudioState('ready',pack.source==='bundled'?'初始声线已就绪':'个人声线已就绪');render()
}
function clearAudioVoices(){
  if(!audio)return;clearInterval(audio.loopTimer);audio.loopTimer=null;audio.sources.forEach(source=>{try{source.stop()}catch{}});audio.oscillators.forEach(source=>{try{source.stop()}catch{}});audio.sources=[];audio.loopers={};audio.gains={};audio.oscillators=[];
}
function stopAndClearAudio(){if(!audio)return;cancelAnimationFrame(audio.raf);clearAudioVoices();const ctx=audio.ctx;releaseMediaChannel(ctx);try{ctx.close()}catch{}audio=null}
function addVoiceOption(pack,{select=false}={}){personalVoicePacks.set(pack.id,pack);const voiceSelect=$('#voiceSelect');voiceSelect.querySelector(`option[value="${PERSONAL_EMPTY_ID}"]`)?.remove();let opt=voiceSelect.querySelector(`option[value="${pack.id}"]`);if(!opt){opt=document.createElement('option');opt.value=pack.id;voiceSelect.append(opt)}opt.textContent=pack.source==='bundled'?pack.name:`${pack.name} · 本机`;voiceSelect.disabled=false;if(select){voiceSelect.value=pack.id;state.voicePackId=pack.id}}
async function loadVoicePacks(){try{const response=await fetch('./assets/default-voice/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error(`初始声线清单 ${response.status}`);addVoiceOption(await response.json(),{select:true})}catch(err){console.warn('Bundled voice unavailable.',err)}try{const packs=(await dbAll('voicePacks')).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));packs.forEach(pack=>addVoiceOption(pack))}catch(err){console.warn('Local voice storage unavailable.',err)}if(!personalVoicePacks.size)$('#voiceSelect').disabled=true;$('#voiceSelect').addEventListener('change',e=>switchVoice(e.target.value))}

function bindMobileTabs(){
  const layout=$('#mobileLayout'),anchor=$('#mobileStageAnchor'),stage=$('#anatomyStage'),dock=$('#phonationDock'),anatomyPanel=$('[data-panel="anatomy"]'),vowels=$('.vowel-switcher');
  const mobileQuery=window.matchMedia('(max-width: 780px), (max-width: 950px) and (orientation: landscape)');
  const placeStage=()=>{
    if(mobileQuery.matches){if(stage.parentElement!==anchor)anchor.append(stage,dock)}
    else if(stage.parentElement!==anatomyPanel){anatomyPanel.insertBefore(stage,vowels);anatomyPanel.append(dock)}
  };
  const selectTab=name=>{
    $$('.mobile-tabs [data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
    $$('[data-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===name));
  };
  $$('.mobile-tabs [data-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
  const controlsPanel=$('[data-panel="controls"]');
  $$('.mobile-control-modes button').forEach(button=>button.addEventListener('click',()=>{
    controlsPanel.dataset.controlView=button.dataset.controlView;
    $$('.mobile-control-modes button').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));
  }));
  controlsPanel.dataset.controlView='sliders';
  $('#toggleMobileStage').addEventListener('click',event=>{
    const collapsed=layout.classList.toggle('stage-collapsed');
    event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
    event.currentTarget.textContent=collapsed?'展开图':'收起图';
  });
  if(mobileQuery.addEventListener)mobileQuery.addEventListener('change',placeStage);
  else mobileQuery.addListener(placeStage);
  placeStage();selectTab('anatomy');
}
function showToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

let dbPromise;
function getDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('VocalTractLab',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});if(!db.objectStoreNames.contains('voicePacks'))db.createObjectStore('voicePacks',{keyPath:'id'});if(!db.objectStoreNames.contains('voiceSamples'))db.createObjectStore('voiceSamples',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function dbPut(store,value){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function dbSaveVoicePack(manifest,records){const db=await getDb();return new Promise((resolve,reject)=>{const tx=db.transaction(['voicePacks','voiceSamples'],'readwrite'),packs=tx.objectStore('voicePacks'),samples=tx.objectStore('voiceSamples');packs.put(manifest);records.forEach(record=>samples.put(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('本机存储写入失败'));tx.onabort=()=>reject(tx.error||Error('本机存储事务已取消'))})}
async function dbAll(store){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function dbDelete(store,id){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

window.__vocalLab={get audio(){return audio},get state(){return state},acousticValues,PitchCore,estimateF0,runPitchCoreTests,runPitchDetectionSelfTests};

async function init(){bindControls();bindFormantExplainer();bindPhonation();bindSnapshots();bindMobileTabs();setupVoiceLab();const pitchCoreResult=runPitchCoreTests();if(new URLSearchParams(location.search).get('test')==='pitch-core')setTimeout(()=>runPitchDetectionSelfTests(pitchCoreResult));try{slots={...slots,...JSON.parse(localStorage.getItem('vocalLabSlots')||'{}')}}catch(err){console.warn('Local settings unavailable.',err)}try{snapshots=(await dbAll('snapshots')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}catch(err){console.warn('Snapshot storage unavailable.',err)}await loadVoicePacks();renderSnapshots();render();if(!personalVoicePacks.size)setAudioState('','请先创建我的声线')}
init();
