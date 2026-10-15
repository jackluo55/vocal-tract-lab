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
const NATURAL_PITCH_MIDIS=[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72];
function pitchFromMidi(midi){const noteNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],pitchClass=((midi%12)+12)%12,octave=Math.floor(midi/12)-1;return {midi,note:`${noteNames[pitchClass]}${octave}`,solfege:SOLFEGE[pitchClass]||noteNames[pitchClass],hz:440*Math.pow(2,(midi-69)/12)}}
let recordingTargetPitch=pitchFromMidi(60);
const PARAMETER_LABELS={tongueHeight:'舌高',tongueFrontness:'舌位前后',suprahyoidTension:'舌骨上肌群',thyrohyoidTension:'甲状舌骨肌',jawOpening:'下颌开度',lipRounding:'唇部圆展',larynxHeight:'喉位',velumOpening:'软腭开度'};
const PERSONAL_EMPTY_ID='personal-empty',DEFAULT_VOICE_ID='default-personal';
const DEFAULT_STATE={tongueHeight:30,tongueFrontness:52,suprahyoidTension:30,thyrohyoidTension:35,jawOpening:72,lipRounding:22,larynxHeight:42,velumOpening:18};
const state={...DEFAULT_STATE,currentVowel:'a',isPhonating:false,voicePackId:DEFAULT_VOICE_ID};
let audio=null,referenceAudioContext=null,locked=false,pressing=false,phonationRequest=0,dragControl=null,snapshots=[],slots={A:null,B:null},toastTimer=null,auditionTimer=null;
const personalSamples={a:null,e:null,i:null,o:null,u:null};
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
function pitchLabel(){return `${recordingTargetPitch.solfege} · ${recordingTargetPitch.note} · ${recordingTargetPitch.hz.toFixed(2)} Hz`}
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
  clearTimeout(auditionTimer);pressing=true;await startPhonation();auditionTimer=setTimeout(()=>{pressing=false;stopPhonation()},1400);
}
async function switchVoice(id,{announce=true}={}){
  clearTimeout(auditionTimer);pressing=false;locked=false;phonationRequest++;state.isPhonating=false;syncLockUi();
  state.voicePackId=id;$('#voiceSelect').value=id;stopAndClearAudio();
  audio=await initAudio();if(personalVoicePacks.has(id))await loadVoicePack(id);
  Object.assign(state,vowelPreset(state.currentVowel));
  if(announce)showToast('已载入我的声线及五个专属元音参数点');render();
}
function applyTenorPreset(){
  clearTimeout(auditionTimer);pressing=false;locked=false;phonationRequest++;state.isPhonating=false;
  const phonateButton=$('#phonateButton'),vowel=state.currentVowel,voiceName=$('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','')||'我的声线';phonateButton.classList.remove('is-playing');syncLockUi();
  Object.assign(state,tenorPresetAtPitch(vowel));
  render();if(audio?.mode!=='error')setAudioState('ready',`${voiceName} · [${vowel}] ${recordingTargetPitch.note} 参数已载入`);showToast(`已将 [${vowel}] 的 ${recordingTargetPitch.note}（${recordingTargetPitch.hz.toFixed(2)} Hz）男高音估算构形应用到${voiceName}；声线未切换`);
}

async function initAudio(){
  if(audio){if(audio.ready)await audio.ready;return audio}
  setAudioState('loading','载入声线…');
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const sum=ctx.createGain(),nasal=ctx.createBiquadFilter(),notch=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),rounding=ctx.createBiquadFilter(),body=ctx.createBiquadFilter(),f1Filter=ctx.createBiquadFilter(),f2Filter=ctx.createBiquadFilter(),f3Filter=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor(),master=ctx.createGain(),analyser=ctx.createAnalyser();
  nasal.type='peaking';nasal.frequency.value=280;nasal.Q.value=1.2;notch.type='notch';notch.frequency.value=900;notch.Q.value=2;tone.type='highshelf';tone.frequency.value=1800;rounding.type='lowpass';rounding.frequency.value=7600;rounding.Q.value=.72;body.type='lowshelf';body.frequency.value=520;compressor.threshold.value=-16;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.01;compressor.release.value=.18;master.gain.value=0;analyser.fftSize=2048;analyser.smoothingTimeConstant=.8;
  [f1Filter,f2Filter,f3Filter].forEach((filter,i)=>{filter.type='peaking';filter.Q.value=[4,5,6][i];filter.gain.value=[8,7,5][i]});
  sum.connect(nasal).connect(notch).connect(tone).connect(rounding).connect(body).connect(f1Filter).connect(f2Filter).connect(f3Filter).connect(compressor).connect(master).connect(analyser).connect(ctx.destination);
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve});
  audio={ctx,sum,nasal,notch,tone,rounding,body,f1Filter,f2Filter,f3Filter,compressor,master,analyser,gains:{},sources:[],loopers:{},loopTimer:null,oscillators:[],mode:'samples',raf:null,ready,readyResolve};
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
async function startPhonation(){if(!personalVoicePacks.has(state.voicePackId)){pressing=false;locked=false;syncLockUi();$('#voiceDialog').showModal();showToast('请先录制或导入五个元音，创建“我的声线”');return}const request=++phonationRequest;await initAudio();if(audio.mode==='empty')await loadVoicePack(state.voicePackId);if(request!==phonationRequest||(!pressing&&!locked)||audio.mode==='error')return;if(audio.ctx.state==='suspended')await audio.ctx.resume();state.isPhonating=true;setAudioState('playing',`正在发 [${state.currentVowel}]`);$('#phonateButton').classList.add('is-playing');$('#phonateButton').setAttribute('aria-pressed','true');render()}
function stopPhonation(){if(locked)return;phonationRequest++;state.isPhonating=false;setAudioState(audio?'ready':'','等待发声');$('#phonateButton').classList.remove('is-playing');$('#phonateButton').setAttribute('aria-pressed','false');render()}
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
function bindPhonation(){
  const btn=$('#phonateButton');let pressStarted=0;
  btn.addEventListener('pointerdown',e=>{if(e.button!==0)return;if(locked){toggleLock();return}pressStarted=performance.now();pressing=true;startPhonation()});
  window.addEventListener('pointerup',()=>{if(!pressing)return;const quickTap=performance.now()-pressStarted<320;pressing=false;if(quickTap){locked=true;syncLockUi();startPhonation()}else stopPhonation()});
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

function setupVoiceLab(){
  const grid=$('#sampleGrid');grid.innerHTML=['a','e','i','o','u'].map(v=>`<div class="sample-card" data-vowel="${v}"><strong>[${v}]</strong><small>等待样本</small><div class="sample-actions"><label>导入<input type="file" accept="audio/wav,.wav,audio/*"></label><button type="button" class="record">录制</button></div></div>`).join('');
  $('#pitchKeyboard').innerHTML=NATURAL_PITCH_MIDIS.map(midi=>{const pitch=pitchFromMidi(midi);return `<button class="pitch-option" type="button" data-midi="${midi}" aria-pressed="${midi===recordingTargetPitch.midi}"><strong>${pitch.solfege}</strong><span>${pitch.note}</span><small>${pitch.hz.toFixed(2)} Hz</small></button>`}).join('');
  $$('.sample-card input').forEach(input=>input.addEventListener('change',e=>validateSample(e.target.closest('.sample-card').dataset.vowel,e.target.files[0])));$$('.sample-card .record').forEach(btn=>btn.addEventListener('click',()=>recordSample(btn.closest('.sample-card').dataset.vowel,btn)));
  $$('.pitch-option').forEach(button=>button.addEventListener('click',()=>selectRecordingPitch(Number(button.dataset.midi))));
  $('#openVoiceLab').onclick=()=>openVoiceDialog(false);$('#openPitchPicker').onclick=()=>openVoiceDialog(true);$('#openInfo').onclick=()=>$('#infoDialog').showModal();$('#saveVoicePack').onclick=saveVoicePack;$('#exportCurrentVoice').onclick=exportCurrentVoice;$('#playReferencePitch').onclick=playReferencePitch;
  renderPitchSelection();
}
function openVoiceDialog(focusPitch){const dialog=$('#voiceDialog');dialog.showModal();if(focusPitch)setTimeout(()=>{$('#pitchPicker').scrollIntoView({block:'center',behavior:'smooth'});$('.pitch-option.active')?.focus()},80)}
function selectRecordingPitch(midi){
  if(midi===recordingTargetPitch.midi)return;recordingTargetPitch=pitchFromMidi(midi);
  const hadSamples=Object.values(personalSamples).some(Boolean);Object.keys(personalSamples).forEach(vowel=>personalSamples[vowel]=null);$$('.sample-card').forEach(card=>{card.classList.remove('ready','error');card.querySelector('small').textContent='等待样本'});updateVoiceSave();render();
  $('#recordStatus').textContent=`已选择 ${pitchLabel()}。现在五个元音都只能录制这个音高。`;showToast(`${hadSamples?'已清除之前的样本；':''}目标音高已改为 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}`);
}
async function playReferencePitch(){
  const button=$('#playReferencePitch');button.disabled=true;button.textContent=`正在播放 ${recordingTargetPitch.solfege}…`;
  try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw Error('当前浏览器不支持网页音频');if(!referenceAudioContext||referenceAudioContext.state==='closed')referenceAudioContext=new AudioContextClass({latencyHint:'interactive'});const ctx=referenceAudioContext;if(ctx.state!=='running')await ctx.resume();const osc=ctx.createOscillator(),harmonic=ctx.createOscillator(),mainGain=ctx.createGain(),harmonicGain=ctx.createGain(),now=ctx.currentTime+.03;
  osc.type='sine';osc.frequency.setValueAtTime(recordingTargetPitch.hz,now);harmonic.type='sine';harmonic.frequency.setValueAtTime(recordingTargetPitch.hz*2,now);mainGain.gain.setValueAtTime(.0001,now);mainGain.gain.exponentialRampToValueAtTime(.24,now+.08);mainGain.gain.setValueAtTime(.24,now+1.55);mainGain.gain.exponentialRampToValueAtTime(.0001,now+1.82);harmonicGain.gain.value=.045;osc.connect(mainGain);harmonic.connect(harmonicGain).connect(mainGain);mainGain.connect(ctx.destination);osc.start(now);harmonic.start(now);osc.stop(now+1.84);harmonic.stop(now+1.84);button.dataset.audioState='playing';setAudioState('playing',`参考音 ${recordingTargetPitch.note} · ${recordingTargetPitch.hz.toFixed(2)} Hz`);osc.onended=()=>{button.disabled=false;button.textContent='播放所选参考音';button.dataset.audioState='ready';setAudioState(audio?.mode==='personal'?'ready':'',audio?.mode==='personal'?'我的声线已就绪':'等待发声')}}catch(err){console.error('Reference pitch failed.',err);button.disabled=false;button.textContent='重新播放参考音';button.dataset.audioState='error';setAudioState('error','参考音播放失败');showToast('参考音未能播放：请关闭静音、调高媒体音量后重试')}
}
function median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2}
function estimateF0(data,sampleRate){
  const frameSize=Math.min(4096,2**Math.floor(Math.log2(data.length/3))),start=Math.max(0,Math.floor(data.length*.5-frameSize/2)),frame=new Float32Array(frameSize);let mean=0;
  for(let i=0;i<frameSize;i++)mean+=data[start+i]||0;mean/=frameSize;
  for(let i=0;i<frameSize;i++)frame[i]=(data[start+i]||0)-mean;
  const minLag=Math.floor(sampleRate/500),maxLag=Math.min(frameSize>>1,Math.ceil(sampleRate/65));let bestLag=0,best=-Infinity;
  for(let lag=minLag;lag<=maxLag;lag++){let sum=0,a=0,b=0;for(let i=0;i<frameSize-lag;i++){const x=frame[i],y=frame[i+lag];sum+=x*y;a+=x*x;b+=y*y}const score=sum/Math.sqrt(a*b+1e-12);if(score>best){best=score;bestLag=lag}}
  if(!bestLag||best<.22)throw Error('未识别到稳定音高，请保持一个持续元音');
  return sampleRate/bestLag;
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
function analyzeVoiceSample(buffer,vowel){const data=buffer.getChannelData(0),f0=estimateF0(data,buffer.sampleRate),formants=estimateFormants(data,buffer.sampleRate,vowel,f0);return {f0:Math.round(f0),...formants}}
function buildPersonalAnalysis(samples){
  const vowels={};for(const [v,sample] of Object.entries(samples)){const measured=sample.analysis,base=VOWELS[v],preset=VOWEL_PRESETS[v],f1Delta=measured.f1-base.f1,f2Delta=measured.f2-base.f2,f3Delta=measured.f3-base.f3;vowels[v]={...measured,params:{...preset,tongueHeight:clamp(preset.tongueHeight-f1Delta/6),jawOpening:clamp(preset.jawOpening+f1Delta/8),tongueFrontness:clamp(preset.tongueFrontness+f2Delta/22),lipRounding:clamp(preset.lipRounding-f2Delta/28),larynxHeight:clamp(preset.larynxHeight+f3Delta/25)}}}return {f0:Math.round(median(Object.values(vowels).map(v=>v.f0))),targetPitch:{...recordingTargetPitch},vowels,method:'浏览器 LPC 教学估计'};
}
async function validateSample(vowel,file){
  const card=$(`.sample-card[data-vowel="${vowel}"]`),msg=card.querySelector('small');card.classList.remove('ready','error');if(!file)return;
  try{const ownsContext=!audio?.ctx,ctx=audio?.ctx||new (window.AudioContext||window.webkitAudioContext)(),buffer=await ctx.decodeAudioData(await file.arrayBuffer()),duration=buffer.duration,data=buffer.getChannelData(0);let peak=0,rms=0;for(let i=0;i<data.length;i+=8){peak=Math.max(peak,Math.abs(data[i]));rms+=data[i]*data[i]}rms=Math.sqrt(rms/(data.length/8));if(duration<2.5||duration>7)throw Error(`时长 ${duration.toFixed(1)} 秒，请保持 3–6 秒`);if(peak>.995)throw Error('检测到削波，请降低录音音量');if(rms<.015)throw Error('音量过低或背景过静');msg.textContent='正在分析音高与共振峰…';await new Promise(resolve=>setTimeout(resolve));const analysis=analyzeVoiceSample(buffer,vowel),pitchCents=Math.round(1200*Math.log2(analysis.f0/recordingTargetPitch.hz));if(Math.abs(pitchCents)>50)throw Error(`检测为 ${analysis.f0} Hz，与所选 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note} 相差 ${Math.abs(pitchCents)} 音分；请只录制所选音高`);analysis.referencePitchCents=pitchCents;analysis.targetMidi=recordingTargetPitch.midi;personalSamples[vowel]={blob:file,buffer,duration,peak,rms,analysis};if(ownsContext)ctx.close().catch(()=>{});card.classList.add('ready');msg.textContent=`${duration.toFixed(1)} 秒 · ${recordingTargetPitch.solfege} ${recordingTargetPitch.note} · 偏差 ${pitchCents>0?'+':''}${pitchCents} 音分 · F1 ${analysis.f1} · F2 ${analysis.f2}`;updateVoiceSave()}catch(err){personalSamples[vowel]=null;card.classList.add('error');msg.textContent=err.message;updateVoiceSave()}
}
let recorder=null,recordChunks=[],recordTimer=null;
async function recordSample(vowel,button){
  if(recorder?.state==='recording'){recorder.stop();return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});recordChunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>recordChunks.push(e.data);recorder.onstop=async()=>{clearTimeout(recordTimer);stream.getTracks().forEach(t=>t.stop());button.textContent='录制';await validateSample(vowel,new File(recordChunks,`${vowel}.webm`,{type:recorder.mimeType}));$('#recordStatus').textContent=`[${vowel}] 录制检查完成；目标是 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}。`};recorder.start();button.textContent='停止';$('#recordStatus').textContent=`正在录制 [${vowel}]… 只唱 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}（${recordingTargetPitch.hz.toFixed(2)} Hz）。`;recordTimer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),6000)}catch(err){$('#recordStatus').textContent='无法使用麦克风，请检查浏览器权限或改用文件导入。'}
}
function updateVoiceSave(){
  const ready=Object.entries(personalSamples).filter(([,sample])=>Boolean(sample)).map(([vowel])=>vowel),missing=Object.keys(personalSamples).filter(vowel=>!personalSamples[vowel]),button=$('#saveVoicePack');
  button.disabled=ready.length!==5;
  if(recorder?.state==='recording')return;
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
  Object.keys(personalSamples).forEach(vowel=>personalSamples[vowel]=null);$$('.sample-card').forEach(card=>{card.classList.remove('ready','error');card.querySelector('small').textContent='等待样本';const input=card.querySelector('input');if(input)input.value=''});$('#packName').value=`我的声线 ${personalVoicePacks.size+1}`;updateVoiceSave();
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function exportCurrentVoice(){const pack=personalVoicePacks.get(state.voicePackId);if(!pack){showToast('当前还没有可导出的个人声线');return}if(pack.source==='bundled'){showToast('初始声线已经随网站提供，无需再次导出');return}const button=$('#exportCurrentVoice');button.disabled=true;button.textContent='正在导出…';try{const records=(await dbAll('voiceSamples')).filter(record=>record.packId===pack.id);if(records.length!==5)throw Error('当前声线的五个元音样本不完整');const samples=[];for(const record of records)samples.push({id:record.id,packId:record.packId,vowel:record.vowel,duration:record.duration,analysis:record.analysis,type:record.blob.type||'audio/webm',data:await blobToDataUrl(record.blob)});const payload={format:'vocal-tract-lab-voice-pack',version:1,exportedAt:new Date().toISOString(),pack,samples},link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));link.download=`${pack.name.replace(/[\\/:*?"<>|]/g,'_')}.vocalpack.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);showToast(`已导出“${pack.name}”的五个元音`)}catch(err){console.error('Voice export failed.',err);showToast(`导出失败：${err.message}`)}finally{button.disabled=false;button.textContent='导出当前声线'}}
async function loadVoicePack(id){
  const pack=personalVoicePacks.get(id);if(!pack)throw Error('找不到所选声线');if(!audio)await initAudio();clearAudioVoices();
  if(pack.source==='bundled'){for(const [vowel,item] of Object.entries(pack.vowels)){let encoded;if(item.audioPath.startsWith('data:')){const base64=item.audioPath.slice(item.audioPath.indexOf(',')+1),binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);encoded=bytes.buffer}else{const response=await fetch(item.audioPath);if(!response.ok)throw Error(`初始声线 [${vowel}] 加载失败`);encoded=await response.arrayBuffer()}const buffer=await audio.ctx.decodeAudioData(encoded);createLoopSource(vowel,buffer)}}else{const records=(await dbAll('voiceSamples')).filter(r=>r.packId===id);if(records.length!==5)throw Error('个人声线样本不完整');for(const r of records){const buffer=await audio.ctx.decodeAudioData(await r.blob.arrayBuffer());createLoopSource(r.vowel,buffer)}}audio.mode='personal';setAudioState('ready',pack.source==='bundled'?'初始声线已就绪':'个人声线已就绪');render()
}
function clearAudioVoices(){
  if(!audio)return;clearInterval(audio.loopTimer);audio.loopTimer=null;audio.sources.forEach(source=>{try{source.stop()}catch{}});audio.oscillators.forEach(source=>{try{source.stop()}catch{}});audio.sources=[];audio.loopers={};audio.gains={};audio.oscillators=[];
}
function stopAndClearAudio(){if(!audio)return;cancelAnimationFrame(audio.raf);clearAudioVoices();try{audio.ctx.close()}catch{}audio=null}
function addVoiceOption(pack,{select=false}={}){personalVoicePacks.set(pack.id,pack);const voiceSelect=$('#voiceSelect');voiceSelect.querySelector(`option[value="${PERSONAL_EMPTY_ID}"]`)?.remove();let opt=voiceSelect.querySelector(`option[value="${pack.id}"]`);if(!opt){opt=document.createElement('option');opt.value=pack.id;voiceSelect.append(opt)}opt.textContent=pack.source==='bundled'?pack.name:`${pack.name} · 本机`;voiceSelect.disabled=false;if(select){voiceSelect.value=pack.id;state.voicePackId=pack.id}}
async function loadVoicePacks(){try{const response=await fetch('./assets/default-voice/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error(`初始声线清单 ${response.status}`);addVoiceOption(await response.json(),{select:true})}catch(err){console.warn('Bundled voice unavailable.',err)}try{const packs=(await dbAll('voicePacks')).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));packs.forEach(pack=>addVoiceOption(pack))}catch(err){console.warn('Local voice storage unavailable.',err)}if(!personalVoicePacks.size)$('#voiceSelect').disabled=true;$('#voiceSelect').addEventListener('change',e=>switchVoice(e.target.value))}

function bindMobileTabs(){$$('.mobile-tabs button').forEach(btn=>btn.addEventListener('click',()=>{$$('.mobile-tabs button').forEach(b=>b.classList.toggle('active',b===btn));$$('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===btn.dataset.tab))}))}
function showToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

let dbPromise;
function getDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('VocalTractLab',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});if(!db.objectStoreNames.contains('voicePacks'))db.createObjectStore('voicePacks',{keyPath:'id'});if(!db.objectStoreNames.contains('voiceSamples'))db.createObjectStore('voiceSamples',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function dbPut(store,value){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function dbSaveVoicePack(manifest,records){const db=await getDb();return new Promise((resolve,reject)=>{const tx=db.transaction(['voicePacks','voiceSamples'],'readwrite'),packs=tx.objectStore('voicePacks'),samples=tx.objectStore('voiceSamples');packs.put(manifest);records.forEach(record=>samples.put(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('本机存储写入失败'));tx.onabort=()=>reject(tx.error||Error('本机存储事务已取消'))})}
async function dbAll(store){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function dbDelete(store,id){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

window.__vocalLab={get audio(){return audio},get state(){return state},acousticValues};

async function init(){bindControls();bindPhonation();bindSnapshots();bindMobileTabs();setupVoiceLab();try{slots={...slots,...JSON.parse(localStorage.getItem('vocalLabSlots')||'{}')}}catch(err){console.warn('Local settings unavailable.',err)}try{snapshots=(await dbAll('snapshots')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}catch(err){console.warn('Snapshot storage unavailable.',err)}await loadVoicePacks();renderSnapshots();render();if(!personalVoicePacks.size)setAudioState('','请先创建我的声线')}
init();
