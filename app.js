const VOWELS = {
  i:{x:.88,y:.88,f1:300,f2:2400,f3:3000,label:'闭口 · 前元音'},
  e:{x:.73,y:.66,f1:450,f2:2100,f3:2800,label:'半闭 · 前元音'},
  a:{x:.48,y:.16,f1:800,f2:1200,f3:2500,label:'开口 · 央元音'},
  o:{x:.28,y:.49,f1:500,f2:900,f3:2400,label:'半闭 · 后圆唇'},
  u:{x:.14,y:.84,f1:350,f2:700,f3:2200,label:'闭口 · 后圆唇'}
};
const VOWEL_PRESETS={
  a:{tongueHeight:30,tongueFrontness:52,suprahyoidTension:30,thyrohyoidTension:35,jawOpening:72,lipRounding:22,larynxHeight:58,velumOpening:92},
  e:{tongueHeight:68,tongueFrontness:76,suprahyoidTension:34,thyrohyoidTension:35,jawOpening:42,lipRounding:10,larynxHeight:56,velumOpening:93},
  i:{tongueHeight:88,tongueFrontness:90,suprahyoidTension:38,thyrohyoidTension:35,jawOpening:24,lipRounding:5,larynxHeight:54,velumOpening:94},
  o:{tongueHeight:52,tongueFrontness:34,suprahyoidTension:31,thyrohyoidTension:37,jawOpening:48,lipRounding:72,larynxHeight:62,velumOpening:92},
  u:{tongueHeight:82,tongueFrontness:22,suprahyoidTension:36,thyrohyoidTension:39,jawOpening:25,lipRounding:92,larynxHeight:64,velumOpening:94}
};
const TENOR_VOWEL_PRESETS={
  a:{...VOWEL_PRESETS.a,suprahyoidTension:42,thyrohyoidTension:58,jawOpening:60,lipRounding:16,larynxHeight:72,velumOpening:92},
  e:{...VOWEL_PRESETS.e,suprahyoidTension:44,thyrohyoidTension:57,jawOpening:38,lipRounding:8,larynxHeight:70,velumOpening:93},
  i:{...VOWEL_PRESETS.i,suprahyoidTension:46,thyrohyoidTension:56,jawOpening:22,lipRounding:4,larynxHeight:69,velumOpening:94},
  o:{...VOWEL_PRESETS.o,suprahyoidTension:42,thyrohyoidTension:59,jawOpening:44,lipRounding:76,larynxHeight:73,velumOpening:92},
  u:{...VOWEL_PRESETS.u,suprahyoidTension:44,thyrohyoidTension:60,jawOpening:23,lipRounding:90,larynxHeight:74,velumOpening:94}
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
let humanOctaveAssist=false;
const manualOctave=0;
const PARAMETER_LABELS={tongueHeight:'舌高',tongueFrontness:'舌位前后',suprahyoidTension:'舌骨上肌群',thyrohyoidTension:'甲状舌骨肌',jawOpening:'下颌开度',lipRounding:'唇部圆展',larynxHeight:'喉位 ↓',velumOpening:'软腭上抬 ↑'};
const VOICE_PARTS={unspecified:'暂不指定',male:'男声',female:'女声',mixed:'假声男高音',soprano:'女高音',mezzo:'女中音',alto:'女低音',tenor:'男高音',baritone:'男中音',bass:'男低音'};
const PERSONAL_EMPTY_ID='personal-empty',DEFAULT_VOICE_ID='personal-1792314371779';
const DEFAULT_STATE={tongueHeight:30,tongueFrontness:52,suprahyoidTension:30,thyrohyoidTension:35,jawOpening:72,lipRounding:22,larynxHeight:58,velumOpening:82};
const FORMANT_EXPLANATIONS={
  f0:'<b>F0 · 基频（音高：唱得高还是低）</b><br>数值越高，唱出的音越高。例如中央 C 约为 261.63 Hz，高一个八度约为 523.25 Hz。这里显示当前元音录音的基频估计；选择录制目标不会自动改变现有录音的音高。',
  f1:'<b>F1 · 第一共振峰（元音开闭：主要与舌位高低、开口有关）</b><br>通常舌位越低、元音越开，F1 越高，如 [a]；舌位越高、元音越闭，F1 越低，如 [i]、[u]。这里的开闭主要指舌头与上腭之间的空间，不能直接换算成嘴巴张多大。本页随滑杆变化的数值为教学模型估计。',
  f2:'<b>F2 · 第二共振峰（元音前后：主要与舌位前后、圆唇有关）</b><br>舌体隆起的位置靠前时，F2 通常较高，如 [i]；靠后并圆唇时通常较低，如 [u]。[i] 和 [u] 的 F1 都较低，但 F2 差别较大，是区分它们的重要线索。这里说的是舌体隆起的位置，不只是舌尖位置。本页随滑杆变化的数值为教学模型估计。',
  f3:'<b>F3 · 第三共振峰（音色特征：与声道整体形状有关）</b><br>表示第三处主要共鸣区域所在的频率。保持同一个音高和元音，改变声道形状，声音的色彩仍可能变化；F3 是观察这种变化的线索之一。数值高低不代表音量大小，也不能单独判断声音更亮或更暗、唱得好坏或共鸣位置高低。本页随滑杆变化的数值为教学模型估计。'
};
const state={...DEFAULT_STATE,currentVowel:'a',isPhonating:false,voicePackId:DEFAULT_VOICE_ID};
let audio=null,referenceAudioContext=null,referenceTone=null,locked=false,pressing=false,auditionActive=false,auditionSequence=0,phonationRequest=0,dragControl=null,toastTimer=null,auditionTimer=null,organHighlightTimer=null;
const mediaOutputRoutes=new WeakMap();
const personalSamples={a:null,e:null,i:null,o:null,u:null};
const previewSamples={a:null,e:null,i:null,o:null,u:null};
let previewAudio=null;
const personalVoicePacks=new Map();
const researchDatasets=new Map();
let selectedReferenceId='tenor-model',voicePartOverrides={},latestTeachingReport='';
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
function availableVoiceVowels(id=state.voicePackId){return Object.keys(personalVoicePacks.get(id)?.vowels||{}).filter(v=>Object.hasOwn(VOWELS,v))}
function hasVoiceVowel(vowel){return availableVoiceVowels().includes(vowel)}
function selectAvailableVoiceVowel(){const available=availableVoiceVowels();if(available.length&&!available.includes(state.currentVowel))state.currentVowel=available[0]}
function renderVoiceAvailability(){
  const pack=personalVoicePacks.get(state.voicePackId);
  $$('.vowel-button,.vowel-anchor').forEach(el=>{const v=el.dataset.vowelSelect||el.dataset.vowel,missing=Boolean(pack)&&!hasVoiceVowel(v);el.setAttribute('aria-disabled',String(missing));el.classList.toggle('unrecorded',missing);el.setAttribute('title',missing?'此声线尚未录制 ['+v+']':'选择 ['+v+']');if(el.tagName==='BUTTON')el.disabled=missing;else el.setAttribute('tabindex',missing?'-1':'0')});
}
function vowelPreset(vowel){return personalVoiceAnalysis()?.vowels?.[vowel]?.params||VOWEL_PRESETS[vowel]}
function highRoundedVowelAmount(){
  if(state.currentVowel!=='o'&&state.currentVowel!=='u')return 0;
  const measured=Number(personalVoiceAnalysis()?.vowels?.[state.currentVowel]?.measuredF0??personalVoiceAnalysis()?.vowels?.[state.currentVowel]?.f0);
  const hz=Number.isFinite(measured)&&measured>0?measured:recordingTargetPitch.hz;
  return clamp((hz-350)/300,0,1);
}
function comparisonPitchForVowel(vowel){
  const sample=personalVoiceAnalysis()?.vowels?.[vowel];
  const measuredHz=Number(sample?.measuredF0??sample?.f0);
  if(Number.isFinite(measuredHz)&&measuredHz>0){
    return {pitch:pitchFromHz(measuredHz),hz:measuredHz,source:'sample'};
  }
  return {pitch:recordingTargetPitch,hz:recordingTargetPitch.hz,source:'target'};
}
function acousticValues(){
  const personal=personalVoiceAnalysis(),measured=personal?.vowels?.[state.currentVowel];
  const profile={f0:personal?.f0||recordingTargetPitch.hz,formantScale:1};
  const w=vowelWeights(),base=usableFormants(measured)?{...VOWELS[state.currentVowel],f1:measured.f1,f2:measured.f2,f3:measured.f3}:VOWELS[state.currentVowel],anchor=vowelPreset(state.currentVowel);
  const lengthScale=profile.formantScale/(1+(state.larynxHeight-anchor.larynxHeight)*.0024+(state.thyrohyoidTension-anchor.thyrohyoidTension)*.00045);
  const f1=clamp((base.f1+(state.jawOpening-anchor.jawOpening)*2.6-(state.tongueHeight-anchor.tongueHeight)*1.7)*lengthScale,180,1100);
  const f2=clamp((base.f2+(state.tongueFrontness-anchor.tongueFrontness)*7.2-(state.lipRounding-anchor.lipRounding)*3.7)*lengthScale,450,3000);
  const f3=clamp((base.f3-(state.larynxHeight-anchor.larynxHeight)*4+(state.suprahyoidTension-anchor.suprahyoidTension)*1.2)*profile.formantScale,1500,3800);
  return {nearest:state.currentVowel,f0:Math.round(measured?.f0||profile.f0),f1:Math.round(f1),f2:Math.round(f2),f3:Math.round(f3),weights:w,pos:vowelPosition()};
}
function restoreOriginalParameters(){
  if(!hasVoiceVowel(state.currentVowel)){showToast('当前元音尚未录制，没有可恢复的原值');return}
  Object.assign(state,vowelPreset(state.currentVowel));render();showToast(`已恢复当前声线 [${state.currentVowel}] 的原始教学构形`);
}
function renderOriginalParameters(){
  const original=vowelPreset(state.currentVowel),available=hasVoiceVowel(state.currentVowel);
  for(const row of $$('.control-row')){
    const key=row.dataset.key,value=Math.round(original[key]);
    let label=row.querySelector('.original-value');if(!label){label=document.createElement('small');label.className='original-value';row.querySelector('span').append(label)}
    label.textContent=available?`原值 ${value}`:'原值 —';
    let mark=row.querySelector('.control-origin-mark');if(!mark){mark=document.createElement('i');mark.className='control-origin-mark';mark.setAttribute('aria-hidden','true');row.append(mark)}
    mark.hidden=!available;mark.style.setProperty('--origin-pct',`${value}%`);
    row.querySelector('input').setAttribute('aria-valuetext',`${Math.round(state[key])}，原值 ${available?value:'未录制'}`);
  }
  const changed=available&&Object.keys(DEFAULT_STATE).some(key=>Math.round(state[key])!==Math.round(original[key]));
  const button=$('#restoreVowelOriginal');if(button)button.disabled=!changed;
  if($('#originalParameterHint'))$('#originalParameterHint').textContent=available?(changed?'已调节；原值数字和细线保持不变。':'当前为本元音原值；细线标记原始位置。'):'此元音尚未录制，无原值';
}
function render(){
  renderVoiceAvailability();
  renderOriginalParameters();
  $$('.control-row').forEach(row=>{const key=row.dataset.key,input=row.querySelector('input'),val=Math.round(state[key]);input.value=val;input.style.setProperty('--pct',`${val}%`);row.querySelector('output').value=val});
  const a=acousticValues();
  $('#nearestVowel').textContent=`[${a.nearest}]`; $('#vowelDescription').textContent=VOWELS[a.nearest].label;
  ['f0','f1','f2','f3'].forEach(k=>$(`#${k}Value`).textContent=a[k]);
  $$('.vowel-anchor').forEach(el=>{const active=el.dataset.vowel===a.nearest;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
  $$('.vowel-button').forEach(el=>{const active=el.dataset.vowelSelect===a.nearest;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
  $('#vowelCursor').setAttribute('transform',`translate(${95+a.pos.x*290} ${220-a.pos.y*185})`);
  const th=state.tongueHeight,tf=state.tongueFrontness,sh=state.suprahyoidTension,thy=state.thyrohyoidTension,jo=state.jawOpening,lr=state.lipRounding,lh=state.larynxHeight,vo=state.velumOpening;
  const tx=500+tf*2.2,ty=600-th*2;
  $('#tonguePath').setAttribute('d',`M${354+tf*.55} ${564+jo*.18} C${430+tf*.35} ${585-th*2.15} ${510+tf*2.3} ${590-th*2.1} ${795+tf*.32} ${610-th*.25} C${738+tf*.16} ${632+jo*.38} ${575+tf*.3} ${676+jo*.2} ${400+tf*.12} ${637+jo*.12} C370 ${625+jo*.06} 352 ${595+jo*.08} ${354+tf*.55} ${564+jo*.18}Z`);
  $('#suprahyoidPath').setAttribute('d',`M${450+sh*.34} ${682-sh*.18} Q${575+sh*.7} ${724-sh*.32} ${704+sh*.62} ${687-sh*.45} Q${640+sh*.22} ${758-sh*.4} ${490+sh*.2} ${739-sh*.25}Z`);
  $('#thyrohyoidPath').setAttribute('d',`M${714+thy*.25} ${694-thy*.16} Q${761+thy*.3} ${727-thy*.18} ${772+thy*.25} ${808-thy*.42} L${735+thy*.18} ${816-thy*.36} Q${737+thy*.15} ${751-thy*.2} ${696+thy*.25} ${718-thy*.12}Z`);
  moveHandle('tongue',tx,ty); moveHandle('jawOpening',500,690+jo*.3); moveHandle('lipRounding',320-lr*.28,520); moveHandle('velumOpening',765,480-vo*.7); moveHandle('suprahyoidTension',620+sh*1.05,724-sh*.65); moveHandle('thyrohyoidTension',748+thy*.45,782-thy*.72); moveHandle('larynxHeight',790,715+lh*1.2);
  $('#jawGroup').setAttribute('transform',`rotate(${jo*.055-3} 352 618) translate(0 ${jo*.12})`);
  const rounding=lr/100;
  $('#lipsGroup').setAttribute('transform',`translate(${-rounding*18} 0) translate(334 520) scale(${1+rounding*.1} ${1-rounding*.12}) translate(-334 -520)`);
  $('#larynxGroup').setAttribute('transform',`translate(0 ${-48+lh*.96-thy*.14})`);
  $('#velumGroup').setAttribute('transform',`rotate(${11-vo*.16} 715 370)`);
  const hv=$('[data-control="tongue"] .handle-value'); if(hv)hv.textContent=`H ${Math.round(th)} · F ${Math.round(tf)}`;
  $$('[role="slider"].handle').forEach(h=>{const key=h.dataset.control;h.setAttribute('aria-valuenow',key==='tongue'?Math.round(th):Math.round(state[key]))});
  document.body.classList.toggle('playing',state.isPhonating); updateAudio(a);
  renderCalibration();renderPitchSelection();renderReferenceOptions();renderComparison();if(typeof renderResearchSummary==='function')renderResearchSummary();
}
function renderCalibration(){
  const card=$('#voiceCalibration');if(!card)return;
  const pack=personalVoicePacks.get(state.voicePackId),item=personalVoiceAnalysis()?.vowels?.[state.currentVowel];
  $('#calibrationName').textContent=`${item?($('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','')||'我的声线'):'我的声线 · 尚未录制'} · [${state.currentVowel}]`;
  $('#calibrationTarget').textContent=item?(personalVoiceAnalysis()?.targetPitch?.note||'旧版未记录'):'—';
  $('#calibrationMeasured').textContent=item?`${Number(item.measuredF0??item.f0).toFixed(2)} Hz`:'—';
  $('#calibrationStability').textContent=Number.isFinite(Number(item?.pitchStdCents))?`±${Math.round(item.pitchStdCents)} 音分`:'未记录';
  $('#calibrationSource').textContent=item?(pack?.source==='bundled'?'网站内置声线 · 作者授权':'浏览器本机分析 · 不上传'):'请创建个人声线';
  card.classList.add('personal');
}
function voicePartOf(pack){const value=voicePartOverrides[pack?.id]||pack?.voicePart||'unspecified';return Object.hasOwn(VOICE_PARTS,value)?value:'unspecified'}
function voiceOptionLabel(pack){const part=voicePartOf(pack),partText=part==='unspecified'?'':` · ${VOICE_PARTS[part]}`;return `${pack.name}${partText}${pack.source==='bundled'?'':' · 本机'}`}
function usableFormants(sample){if(!sample||['f1','f2','f3'].some(key=>sample[key]===null||sample[key]===undefined))return false;const f1=Number(sample?.f1),f2=Number(sample?.f2),f3=Number(sample?.f3);return sample?.formantQuality!=='uncertain'&&Number.isFinite(f1)&&Number.isFinite(f2)&&Number.isFinite(f3)&&f1>0&&f1<f2&&f2<f3&&f2-f1>=80}
function verifiedFormants(sample){return sample?.formantQuality==='stable'&&usableFormants(sample)}
function cohortMembers(part,vowel,hz){
  const seen=new Set();return [...personalVoicePacks.values()].filter(pack=>pack.id!==state.voicePackId&&voicePartOf(pack)===part).map(pack=>{const sample=pack.analysis?.vowels?.[vowel],frequency=Number(sample?.measuredF0??sample?.f0),cents=Number.isFinite(frequency)&&frequency>0&&hz>0?Math.round(1200*Math.log2(frequency/hz)):null;return {pack,sample,frequency,cents}}).filter(row=>{if(!row.sample||row.cents===null||Math.abs(row.cents)>50||!verifiedFormants(row.sample))return false;const fingerprint=row.sample.audioChecksum||row.pack.vowels?.[vowel]?.checksum;if(fingerprint){if(seen.has(fingerprint))return false;seen.add(fingerprint)}return true})
}
function researchRows(dataset,part,vowel,hz){
  const closest=new Map();for(const row of dataset?.rows||[]){if(row.voicePart!==part||row.vowel!==vowel||!Number.isFinite(row.f0)||row.f0<=0||hz<=0)continue;const cents=Math.round(1200*Math.log2(row.f0/hz));if(Math.abs(cents)>50)continue;const key=`${row.source}\u0000${row.singerId}`,previous=closest.get(key);if(!previous||Math.abs(cents)<Math.abs(previous.cents))closest.set(key,{...row,cents})}return [...closest.values()]
}
function reportReference(vowel,hz){
  if(selectedReferenceId==='none')return {kind:'none',label:'未选择参考',params:null};
  if(selectedReferenceId==='tenor-model')return {kind:'model',label:'经典男高音 · 教学模型（非实测）',params:tenorPresetAtPitch(vowel,hz)};
  if(selectedReferenceId.startsWith('data:')){const [id,part]=selectedReferenceId.slice(5).split(':'),dataset=researchDatasets.get(id);if(!dataset||!Object.hasOwn(VOICE_PARTS,part))return {kind:'none',label:'研究数据不可用',params:null};const rows=researchRows(dataset,part,vowel,hz),count=rows.length,eligible=count>=3;return {kind:'data',label:`${dataset.name} · ${VOICE_PARTS[part]}数据组`,dataset,part,rows,count,eligible,params:null,f1:count?median(rows.map(row=>row.f1)):null,f2:count?median(rows.map(row=>row.f2)):null,f3:count?median(rows.map(row=>row.f3)):null}}
  if(selectedReferenceId.startsWith('cohort:')){
    const part=selectedReferenceId.slice(7),members=cohortMembers(part,vowel,hz),count=members.length,minimum=3,eligible=count>=minimum,keys=Object.keys(DEFAULT_STATE),hasCompleteParams=eligible&&members.every(row=>keys.every(key=>Number.isFinite(Number(row.sample.params?.[key])))),params=hasCompleteParams?Object.fromEntries(keys.map(key=>[key,median(members.map(row=>Number(row.sample.params[key])))])):null;
    return {kind:'cohort',label:`${VOICE_PARTS[part]||'未知声部'} · 本机参考组`,part,members,count,minimum,eligible,params,f1:eligible?median(members.map(row=>Number(row.sample.f1))):null,f2:eligible?median(members.map(row=>Number(row.sample.f2))):null,f3:eligible?median(members.map(row=>Number(row.sample.f3))):null,hasPitchAssist:members.some(row=>row.sample.octaveCorrection==='target-octave-assist+1')};
  }
  const pack=personalVoicePacks.get(selectedReferenceId);
  if(!pack||pack.id===state.voicePackId)return {kind:'none',label:'参考声线不可用',params:null};
  const sample=pack.analysis?.vowels?.[vowel],referenceHz=Number(sample?.measuredF0??sample?.f0);
  const cents=Number.isFinite(referenceHz)&&referenceHz>0?Math.round(1200*Math.log2(hz/referenceHz)):null;
  return {kind:'recorded',label:pack.name,pack,sample,referenceHz,cents,samePitch:cents!==null&&Math.abs(cents)<=50,params:cents!==null&&Math.abs(cents)<=50&&verifiedFormants(sample)?sample?.params:null};
}
let referenceOptionsKey='';
function renderReferenceOptions(){
  const select=$('#referenceVoiceSelect');if(!select)return;
  const choices=[['tenor-model','经典男高音 · 教学模型（非实测）'],['none','只看当前录音'],...[...personalVoicePacks.values()].filter(pack=>pack.id!==state.voicePackId).map(pack=>[pack.id,`录音对比 · ${pack.name}`]),...[...researchDatasets.values()].flatMap(dataset=>[...new Set(dataset.rows.map(row=>row.voicePart))].map(part=>[`data:${dataset.id}:${part}`,`${dataset.name} · ${VOICE_PARTS[part]}`]))];
  const key=JSON.stringify(choices);
  if(key!==referenceOptionsKey){select.replaceChildren(...choices.map(([id,label])=>{const option=document.createElement('option');option.value=id;option.textContent=label;return option}));referenceOptionsKey=key}
  if(!choices.some(([id])=>id===selectedReferenceId))selectedReferenceId='none';
  select.value=selectedReferenceId;
  $('#deleteResearchDataset').hidden=!selectedReferenceId.startsWith('data:');
}
function reportBlock(container,title,lines){const section=document.createElement('section'),heading=document.createElement('h4');section.className='report-block';heading.textContent=title;section.append(heading);lines.forEach(line=>{const p=document.createElement('p');p.textContent=line;section.append(p)});container.append(section)}
function renderTeachingReport(){
  const body=$('#teachingReportBody');if(!body)return;
  const pack=personalVoicePacks.get(state.voicePackId),vowel=state.currentVowel,sample=pack?.analysis?.vowels?.[vowel];
  renderReferenceOptions();body.replaceChildren();
  const hz=Number(sample?.measuredF0??sample?.f0),hasPitch=Number.isFinite(hz)&&hz>0,pitch=hasPitch?pitchFromHz(hz):recordingTargetPitch;
  const reference=reportReference(vowel,hasPitch?hz:recordingTargetPitch.hz),sections=[],add=(title,...lines)=>sections.push({title,lines});
  $('#downloadTeachingReport').disabled=!sample;
  $('#applyReportReference').disabled=!reference.params||reference.kind==='recorded'&&!sample;
  if(!sample){
    add('当前元音',`[${vowel}] 尚无录音分析。可以先试听当前声线，或录制当前元音后查看个人结果。`);
  }else{
    add('这段声音',`${pack.name} · [${vowel}] · 音高标注 ${hasPitch?`${pitch.note}（${hz.toFixed(1)} Hz）`:'未记录'}。${Number.isFinite(Number(sample.pitchStdCents))?`中段音高波动约 ${Math.round(sample.pitchStdCents)} 音分。`:''}`);
    if(verifiedFormants(sample))add('音色观察',`录音估计 F1 ${Math.round(sample.f1)}、F2 ${Math.round(sample.f2)}、F3 ${Math.round(sample.f3)} Hz。它们描述声音的共振，不是舌头或喉部位置的测量。`);
    else add('音色观察','这段录音的共振峰还没有通过稳定性检查；先听原声，不根据 F1–F3 判断动作。');
  }
  if(reference.kind==='model'){
    const keys=['tongueHeight','tongueFrontness','jawOpening','lipRounding','larynxHeight'],changes=keys.map(key=>({key,current:Math.round(state[key]),target:Math.round(reference.params[key])})).sort((a,b)=>Math.abs(b.current-b.target)-Math.abs(a.current-a.target)),focus=changes[0];
    add('男高音教学参考',`这是人工设定的构形模型，不是帕瓦罗蒂或其他歌者的实测参数。${focus&&Math.abs(focus.current-focus.target)>=10?`差异最大的是${PARAMETER_LABELS[focus.key]}：当前 ${focus.current}，模型 ${focus.target}。可以只小幅调这一项，再听元音是否更清晰、发声是否舒适。`:'当前主要滑杆与模型接近；不必为了复制数字而改变发声。'}`);
  }else if(reference.kind==='recorded'){
    if(!sample||!reference.sample||!reference.samePitch)add('录音对比',`参考“${reference.label}”与当前 [${vowel}] 缺少同音高的有效样本；暂不比较参数。`);
    else if(verifiedFormants(sample)&&verifiedFormants(reference.sample)&&hz<500&&reference.referenceHz<500&&sample.octaveCorrection!=='target-octave-assist+1'&&reference.sample.octaveCorrection!=='target-octave-assist+1'){
      const d1=Math.round(sample.f1-reference.sample.f1),d2=Math.round(sample.f2-reference.sample.f2),exercise=Math.abs(d1)>=100?`若想试听接近参考的 F1，可在模型里小幅${d1>0?'减小下颌开度或提高舌高':'增大下颌开度或降低舌高'}。`:Math.abs(d2)>=180?`若想试听接近参考的 F2，可在模型里小幅${d2>0?'后移舌位或增加圆唇':'前移舌位或减少圆唇'}。`:'两段录音的主要共振峰差异不大，可先听辨元音清晰度。';
      add('同音高录音对比',`与“${reference.label}”的 [${vowel}] 相比：F1 ${d1>=0?'+':''}${d1} Hz，F2 ${d2>=0?'+':''}${d2} Hz。${exercise}这只是音色实验，不说明真实器官位置有误。`);
    }else add('录音对比',`两段 [${vowel}] 的音高标注接近，可直接听辨差别；目前不依据共振峰给出身体动作建议。`);
  }else add('下一步','可以继续调节一个参数并试听；如果想比对另一位歌者，可导入其五元音声线。');
  add('使用边界','仅供声乐教学与听辨参考，不用于声部鉴定或医学诊断。');
  sections.forEach(section=>reportBlock(body,section.title,section.lines));
  latestTeachingReport=`声道实验台 · [${vowel}] 简明教学报告\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n`+sections.map(section=>`${section.title}\n${section.lines.join('\n')}`).join('\n\n');
}
function renderLegacyTeachingReport(){
  const body=$('#teachingReportBody');if(!body)return;
  const pack=personalVoicePacks.get(state.voicePackId),part=voicePartOf(pack),vowel=state.currentVowel,item=pack?.analysis?.vowels?.[vowel];
  $('#voicePartSelect').value=part;renderReferenceOptions();body.replaceChildren();
  const sections=[],add=(title,...lines)=>sections.push({title,lines});
  const hz=Number(item?.measuredF0??item?.f0),hasHz=Number.isFinite(hz)&&hz>0,pitch=hasHz?pitchFromHz(hz):recordingTargetPitch;
  const reference=reportReference(vowel,hasHz?hz:recordingTargetPitch.hz);
  $('#applyReportReference').disabled=!reference.params||reference.kind==='recorded'&&!item||reference.kind==='model'&&!['tenor','unspecified'].includes(part);
  $('#downloadTeachingReport').disabled=!item;
  add('对象与录音',`声线：${pack?.name||'尚未创建'}；声部：${VOICE_PARTS[part]}（由使用者标注，不由这一段录音自动判定）；元音：[${vowel}]。`,item&&hasHz?`当前元音录音的 F0 标注约 ${hz.toFixed(2)} Hz（${pitch.note}）；录制目标：${pack.analysis?.targetPitch?.note||'旧录音未记录'}。`:item?'当前元音已有录音，但 F0 标注缺失；暂不能做同音高对比。':'尚无该元音录音。请先添加五元音声线，再查看个体声音分析。',`素材来源：${pack?.source==='bundled'?'网站内置、作者授权录音':pack?.importedFrom?`本机导入「${pack.importedFrom}」`:'本机录制或导入'}；原始资料许可：${pack?.originalLicense||'未填写'}。`);
  if(pack?.analysis?.vowels){const overview=['a','e','i','o','u'].map(v=>{const sample=pack.analysis.vowels[v],value=Number(sample?.measuredF0??sample?.f0),formant=key=>Number.isFinite(Number(sample?.[key]))&&Number(sample[key])>0?Math.round(Number(sample[key])):'未记录',quality=sample?.formantQuality==='stable'?'多帧稳定':sample?.formantQuality==='uncertain'?'本次不稳定':'旧版未核验';return sample&&Number.isFinite(value)&&value>0?`[${v}] ${value.toFixed(1)} Hz（${pitchFromHz(value).note}）；F1 ${formant('f1')}、F2 ${formant('f2')}、F3 ${formant('f3')} Hz（${quality}）。`:`[${v}] 未录制或音高未记录。`});add('五元音录音概览',...overview)}
  if(item){
    const f1=Number(item.f1),f2=Number(item.f2),f3=Number(item.f3),validFormants=verifiedFormants(item);
    const correction=item.octaveCorrection==='target-octave-assist+1';
    add('录音声学估计',`F1 ${Number.isFinite(f1)?Math.round(f1):'未记录'} Hz · F2 ${Number.isFinite(f2)?Math.round(f2):'未记录'} Hz · F3 ${Number.isFinite(f3)?Math.round(f3):'未记录'} Hz。F0 是本次录音的音高标注；F1–F3 是录音片段的算法估计，不是器官位置。`,Number.isFinite(Number(item.pitchStdCents))?`中段 ${item.pitchFrames||'少量'} 个取样帧的音高标准差约 ${Math.round(item.pitchStdCents)} 音分；不代表整段录音的最大偏差。`:'音高波动未记录；现有分析不能据此评价整段稳定度。',item.formantQuality==='uncertain'?'多帧共振峰轨迹不稳定，本次仅显示观察值，不据此给出元音调节建议。':!item.formantQuality?'这条声线使用旧版分析，未做多帧稳定性核验；如需声学对比，请重新导入原录音。':!validFormants?'F1–F3 次序或数值不可靠，本次不据此给出元音调节建议。':hz>=500?'此音高较高，泛音间隔大；F1–F3 的误差可能明显增大，请优先听辨原声。':'这些数值适合观察相对差异，不是个人发声的合格线。');
    if(reference.kind==='recorded'){
      const r=reference.sample,r1=Number(r?.f1),r2=Number(r?.f2),r3=Number(r?.f3),refValid=verifiedFormants(r);
      if(!r||!Number.isFinite(reference.referenceHz))add('参考对比',`“${reference.label}”缺少 [${vowel}] 的有效录音标注，暂不能对比。`);
      else if(!reference.samePitch)add('参考对比',`参考“${reference.label}”的 [${vowel}] 标注约 ${reference.referenceHz.toFixed(2)} Hz（${pitchFromHz(reference.referenceHz).note}），与当前录音相差 ${Math.abs(reference.cents)} 音分；不同音高的共振峰不宜直接当作声部标准比较。可录制同一音高的参考样本。`);
      else if(correction||r.octaveCorrection==='target-octave-assist+1')add('当前音高参考对比',`当前与参考“${reference.label}”的 [${vowel}] 音高标注相差约 ${Math.abs(reference.cents)} 音分。${validFormants&&refValid?`录音估计的 F1 相差 ${Math.abs(Math.round(f1-r1))} Hz，F2 相差 ${Math.abs(Math.round(f2-r2))} Hz；这是声学观察，不是器官位置测量。`:'至少一段录音的共振峰估计不够可靠，暂不比较 F1–F3。'}可对照原声听辨元音清晰度与音色；仅凭这两段录音，暂不给舌位、口型或喉位的定向建议。`);
      else if(!validFormants||!refValid)add('参考对比',`参考“${reference.label}”与当前样本音高接近，但至少一段录音的 F1–F3 估计不可靠；暂只进行原声听辨，不据此推断器官动作。`);
      else if(hz>=500||reference.referenceHz>=500)add('高音参考对比',`参考“${reference.label}”与当前 [${vowel}] 的 F0 标注接近。高音时泛音间隔较大，现有短窗 LPC 共振峰估计不适合据此给出舌位、口型或喉位的定向建议；请优先原声听辨。`);
      else{
        const d1=Math.round(f1-r1),d2=Math.round(f2-r2),d3=Math.round(f3-r3),direction=d=>d>0?'高':'低';
        add('同元音·同音高实录对比',`参考：${reference.label}（${VOICE_PARTS[voicePartOf(reference.pack)]}）；两段 F0 标注相差约 ${Math.abs(reference.cents)} 音分。F1 相差 ${Math.abs(d1)} Hz（当前较${direction(d1)}），F2 相差 ${Math.abs(d2)} Hz（当前较${direction(d2)}），F3 相差 ${Math.abs(d3)} Hz（当前较${direction(d3)}）。这些是两条录音的差异，不代表哪条更正确。`,Math.abs(d1)>=100?`若希望接近参考的 F1，可在模型中小幅试验${d1>0?'减小下颌开度或提高舌高':'增大下颌开度或降低舌高'}，试听音色变化；录音本身不能证明下颌或舌头实际处于何处。`:'F1 差异较小，先保持舒适发声并听辨元音清晰度。',Math.abs(d2)>=180?`若希望接近参考的 F2，可小幅试验${d2>0?'舌位后移或增加圆唇':'舌位前移或减少圆唇'}；仅作模型实验，不以数值相同为训练目标。`:'F2 差异较小；不必为了追求相同数值而改变自然发声。',`F3 差异不能单独推断喉位高低；不要仅凭本报告要求压低或抬高喉部。`);
      }
      if(part!=='unspecified'&&voicePartOf(reference.pack)!=='unspecified'&&part!==voicePartOf(reference.pack))add('声部标注',`当前标注为${VOICE_PARTS[part]}，参考标注为${VOICE_PARTS[voicePartOf(reference.pack)]}；跨声部比较只能作为听觉探索，不能作为本声部标准。`);
    }else if(reference.kind==='cohort'||reference.kind==='data'){
      const isResearch=reference.kind==='data',names=isResearch?reference.rows.map(row=>row.singerId).join('、'):reference.members.map(row=>row.pack.name).join('、'),sourceText=isResearch?`来源字段：${[...new Set(reference.dataset.rows.map(row=>row.source))].join('、')}；许可字段：${[...new Set(reference.dataset.rows.map(row=>row.license))].join('、')}。这些是导入文件的自述信息，本站未验证机构、许可或测量方法。`:'此组来自本机导入或已授权声线，不是机构发布的正常范围，也不能证明每条声线来自不同歌者。';
      add(isResearch?'外部数值参考组':'同声部参考组',`筛选条件：[${vowel}]、${VOICE_PARTS[reference.part]}标注、F0 标注与当前相差不超过 50 音分、共振峰次序有效。目前找到 ${reference.count} 位可比成员；至少 3 位才形成组内中位数。${reference.count?`当前成员：${names}。`:''}`,sourceText);
      if(part!=='unspecified'&&part!==reference.part)add('声部标注',`当前标注为${VOICE_PARTS[part]}，所选参考组为${VOICE_PARTS[reference.part]}；跨声部只适合探索，不应把另一声部的数值当作训练目标。`);
      if(reference.eligible){
        add('同音高录音组的声学描述',`参考组 F1 中位数约 ${Math.round(reference.f1)} Hz、F2 约 ${Math.round(reference.f2)} Hz、F3 约 ${Math.round(reference.f3)} Hz。${validFormants?`当前录音相对组中位数：F1 ${Math.round(f1-reference.f1)>=0?'+':''}${Math.round(f1-reference.f1)} Hz，F2 ${Math.round(f2-reference.f2)>=0?'+':''}${Math.round(f2-reference.f2)} Hz，F3 ${Math.round(f3-reference.f3)>=0?'+':''}${Math.round(f3-reference.f3)} Hz。`:'当前录音的共振峰次序不可靠，暂不计算方向差。'}这些是样本差异，不是“发声正确度”评分。`);
        if(!validFormants||hz>=500||reference.hasPitchAssist||correction)add('教学使用建议',isResearch?'可把当前录音与数值资料作描述性比较；外部表格没有可试听原声，且测量方法未由本站核验，不据此建议真实器官位置。':'可先听辨同元音在相同目标音高下的清晰度、稳定感和音色差别。当前测量条件不足以根据数值建议真实器官位置；不要仅凭报告改变喉位或肌肉用力。');
        else{
          const d1=Math.round(f1-reference.f1),d2=Math.round(f2-reference.f2),experiments=[];
          if(Math.abs(d1)>=100)experiments.push(`如果想试听接近该组 F1 的模型效果，可小幅试验${d1>0?'减小下颌开度或提高舌高':'增大下颌开度或降低舌高'}，观察元音是否仍清楚、发声是否舒适。`);
          if(Math.abs(d2)>=180)experiments.push(`如果想试听接近该组 F2 的模型效果，可小幅试验${d2>0?'舌位后移或增加圆唇':'舌位前移或减少圆唇'}。`);
          add('可试听的构形实验',...(experiments.length?experiments:['F1/F2 与本机参考组的中位数相近；无需追逐相同数字。']),'这些只是交互模型里的音色实验，不代表身体部位的实测位置；喉位不能由 F3 单独反推。');
        }
      }else if(isResearch&&reference.count){add('个案数据的声学差异',`目前仅有 ${reference.count} 位歌者的可比记录，不构成声部标准。${validFormants?`当前录音相对这些记录的描述值：F1 ${Math.round(f1-reference.f1)>=0?'+':''}${Math.round(f1-reference.f1)} Hz、F2 ${Math.round(f2-reference.f2)>=0?'+':''}${Math.round(f2-reference.f2)} Hz、F3 ${Math.round(f3-reference.f3)>=0?'+':''}${Math.round(f3-reference.f3)} Hz。`:'当前录音的共振峰次序不可靠，暂不计算方向差。'}仅凭个案数值不建议改变真实喉位、舌位或肌肉用力。`,'如需组内中位数，请补充至少三位不同歌者、同元音且相近音高的有效记录。')}
      else add('参考组尚不足',isResearch?'请导入至少一位同元音、相近音高的有效记录；三位及以上才形成参考组中位数。':'请再导入同一声部、同一元音、相近音高的独立录音。现阶段不会凭少量样本生成“标准比例”或个体动作建议。');
    }else if(reference.kind==='model'){
      add('教学模型对比',`“${reference.label}”只是一组人工设定的 0–100 滑杆构形，没有该音高的男高音实录声学数值，不能把它称为男高音标准或名师参数。${part!=='tenor'&&part!=='unspecified'?`当前标注是${VOICE_PARTS[part]}，不建议按男高音模型载入构形。`:''}`);
      if(part==='tenor'||part==='unspecified'){
        const keys=['tongueHeight','tongueFrontness','jawOpening','lipRounding','larynxHeight'],diffs=keys.map(key=>({key,diff:Math.round(state[key]-reference.params[key])})).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
        const experiments=diffs.filter(row=>Math.abs(row.diff)>=10).slice(0,2).map(row=>`${PARAMETER_LABELS[row.key]}滑杆：当前 ${Math.round(state[row.key])}、模型 ${Math.round(reference.params[row.key])}。可试验向模型值小幅移动并听辨；这不说明你的真实${PARAMETER_LABELS[row.key]}位置有误。`);
        add('可试听的模型实验',...(experiments.length?experiments:['当前主要可调滑杆与教学模型接近；不必为了复制数字而改变发声。']),`尤其不能从 F3 或滑杆数值推断“应该压低喉位”或要求特定肌肉用力。`);
      }
    }
    else add('参考对比','尚未选用实录参考。可以导入经授权的五元音声线，选择相同元音及相近音高后再比较。');
    if(reference.params&&reference.kind==='recorded'&&reference.samePitch&&!correction&&reference.sample?.octaveCorrection!=='target-octave-assist+1'){const keys=['tongueHeight','tongueFrontness','jawOpening','lipRounding','larynxHeight'],differences=keys.map(key=>({key,diff:Math.round(state[key]-reference.params[key])})).filter(row=>Number.isFinite(row.diff)).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));add('界面构形滑杆',differences.slice(0,3).map(row=>`${PARAMETER_LABELS[row.key]}：当前 ${Math.round(state[row.key])}、参考映射 ${Math.round(reference.params[row.key])}，差 ${row.diff>0?'+':''}${row.diff}。`).join(' '),'参考滑杆同样由录音声学估计映射，并非声带、舌骨或喉部的实测位置；可试听小幅调节的效果，不应模仿肌肉用力。')}
  }else add('参考与建议','这条声线尚无当前元音的录音分析；已有滑杆和图示只能作为教学模型，不能生成个人声学结论。');
  if(reference.kind==='recorded'&&pack?.analysis?.vowels){
    const overview=['a','e','i','o','u'].map(v=>{const own=pack.analysis.vowels[v],other=reference.pack.analysis?.vowels?.[v],ownHz=Number(own?.measuredF0??own?.f0),otherHz=Number(other?.measuredF0??other?.f0);if(!own||!other||!Number.isFinite(ownHz)||!Number.isFinite(otherHz)||ownHz<=0||otherHz<=0)return `[${v}] 缺少有效的双边样本。`;const cents=Math.round(1200*Math.log2(ownHz/otherHz));if(Math.abs(cents)>50)return `[${v}] 两段音高标注相差 ${Math.abs(cents)} 音分，暂不直接比较。`;if(own.octaveCorrection==='target-octave-assist+1'||other.octaveCorrection==='target-octave-assist+1')return `[${v}] 两段有相近的目标音高标注，可听辨原声；暂不据此做定向调整。`;if(ownHz>=500||otherHz>=500)return `[${v}] 音高相近；高音共振峰仅供观察，不给定向调整结论。`;if(!verifiedFormants(own)||!verifiedFormants(other))return `[${v}] 音高相近，但至少一段共振峰估计尚未通过多帧稳定性检查；仅供听辨。`;const f1=Number(own.f1)-Number(other.f1),f2=Number(own.f2)-Number(other.f2);return `[${v}] 音高相近；相对参考 F1 ${f1>=0?'+':''}${Math.round(f1)} Hz、F2 ${f2>=0?'+':''}${Math.round(f2)} Hz（仅描述录音差异）。`});
    add('五元音参考可比性',...overview);
  }
  if(['cohort','data'].includes(reference.kind)&&pack?.analysis?.vowels){const overview=['a','e','i','o','u'].map(v=>{const own=pack.analysis.vowels[v],ownHz=Number(own?.measuredF0??own?.f0);if(!own||!Number.isFinite(ownHz)||ownHz<=0)return `[${v}] 当前声线尚无有效录音标注。`;const count=(reference.kind==='data'?researchRows(reference.dataset,reference.part,v,ownHz):cohortMembers(reference.part,v,ownHz)).length;return `[${v}] 同声部、相近音高且共振峰次序有效的参考成员 ${count} 位${count<3?'；未形成参考组。':'；可查看该元音的组内中位数。'}`});add('五元音参考组覆盖情况',...overview)}
  add('方法依据','声部标签与五元音持续音的采集设计参考 VocalSet（Wilkins 等，ISMIR 2018）：https://pseeth.github.io/public/papers/wilkins_seetharaman_ismir18.pdf 。该研究不是本程序的声部滑杆数值来源。','固定音高下比较歌唱声音谱的研究示例：https://pmc.ncbi.nlm.nih.gov/articles/PMC2671792/ 。本程序没有复制论文原始录音或把其结果当作个人标准。','LPC 共振峰估计的局限参考 Praat 官方说明：https://praat.org/manual/FAQ__Formant_analysis.html 。');
  add('使用边界','本报告仅供声乐教学与听辨参考，不构成声部鉴定、医学诊断或一套人人适用的正确发声比例。声部需结合舒适音区、音色、换声区及教师长期观察。');
  sections.forEach(section=>reportBlock(body,section.title,section.lines));
  latestTeachingReport=`声道实验台 · 元音教学报告\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n`+sections.map(section=>`${section.title}\n${section.lines.join('\n')}`).join('\n\n');
}
function renderComparison(){
  const rows=$('#comparisonRows');if(!rows)return;
  const comparison=comparisonPitchForVowel(state.currentVowel),reference=reportReference(state.currentVowel,comparison.hz),target=comparison.source==='target'&&['recorded','cohort','data'].includes(reference.kind)?null:reference.params,voiceName=$('#voiceSelect').selectedOptions[0]?.textContent?.replace(' · 本机','').replace(' · 请先录制','')||'我的声线';
  $('#comparisonCurrentName').textContent=voiceName;$('#comparisonVowel').textContent=`[${state.currentVowel}]`;$('#comparisonPitch').textContent=`${comparison.pitch.note} · ${comparison.hz.toFixed(2)} Hz${comparison.source==='sample'?' · 录音标注':' · 录音目标'}`;$('#comparisonTenorName').textContent=reference.label;
  $('#comparisonDescription').textContent=reference.kind==='model'?'右侧为教学模型，不是歌者实测值或声部标准。':reference.kind==='data'?'研究声学数据与形态测量显示在下方；缺失项不补造，右侧滑杆留空。':reference.kind==='cohort'&&comparison.source!=='sample'?'当前元音缺少录音，右侧暂不显示参考组差值。':reference.kind==='cohort'&&!reference.eligible?`参考组当前仅有 ${reference.count} 条同元音、相近音高且质量可用的声线；至少需 3 条。`:reference.kind==='cohort'?'右侧为本机声部参考组的教学滑杆中位数，不是器官实测位置或通用标准。':reference.kind==='recorded'&&comparison.source!=='sample'?'当前元音缺少个人录音，右侧暂不显示差值。':reference.kind==='recorded'&&reference.samePitch?'右侧是另一条同元音、近似同音高录音经算法映射的教学滑杆，不是实测器官位置。':reference.kind==='recorded'?'参考声线与当前录音音高不同；为避免误导，右侧不显示参数差值。':'请在上方选择可对比的参考声线。';
  if(!rows.firstElementChild)rows.innerHTML=Object.keys(DEFAULT_STATE).map(key=>`<div class="comparison-row" data-comparison-key="${key}"><span>${PARAMETER_LABELS[key]}</span><div class="comparison-pair"><div class="comparison-value current-value"><span></span><b></b><input class="comparison-slider" type="range" min="0" max="100" step="1" data-key="${key}" aria-label="对比图调节${PARAMETER_LABELS[key]}"></div><div class="comparison-value tenor-value"><span></span><b></b></div></div><small></small></div>`).join('');
  for(const row of rows.children){const key=row.dataset.comparisonKey,current=Math.round(state[key]),value=Number(target?.[key]),available=Number.isFinite(value),referenceValue=available?Math.round(value):0,difference=current-referenceValue;
    const original=Math.round(vowelPreset(state.currentVowel)[key]);let originLabel=row.querySelector('.comparison-original');if(!originLabel){originLabel=document.createElement('em');originLabel.className='comparison-original';row.firstElementChild.append(originLabel)}originLabel.textContent=`原值 ${original}`;
    let mark=row.querySelector('.comparison-origin-mark');if(!mark){mark=document.createElement('i');mark.className='comparison-origin-mark';mark.setAttribute('aria-hidden','true');row.querySelector('.current-value').append(mark)}mark.style.setProperty('--origin-pct',`${original}%`);
    row.querySelector('.current-value span').style.width=`${current}%`;row.querySelector('.current-value b').textContent=current;const input=row.querySelector('input');input.value=current;input.setAttribute('aria-valuetext',`${current} / 100`);
    row.querySelector('.tenor-value span').style.width=`${referenceValue}%`;row.querySelector('.tenor-value b').textContent=available?referenceValue:'—';row.querySelector('small').textContent=!available?'—':difference===0?'相同':`${difference>0?'+':''}${difference}`;row.querySelector('small').classList.toggle('same',!available||difference===0);
  }
}
function isMaleVoicePart(part){return ['male','tenor','baritone','bass'].includes(part)}
function pitchNotation(pitch,part){return isMaleVoicePart(part)?pitchFromMidi(pitch.midi-12).note:pitch.note}
function pitchLabel(part=voicePartOf(personalVoicePacks.get(state.voicePackId))){return `${recordingTargetPitch.solfege} · ${pitchNotation(recordingTargetPitch,part)}${recordingTargetPitch.landmark&&!isMaleVoicePart(part)?`（${recordingTargetPitch.landmark}）`:''} · ${recordingTargetPitch.hz.toFixed(2)} Hz`}
function updatePitchDebug({rawFrequency,correctedFrequency,confidence,source='真人录音',sampleRate,duration,detector='MPM + YIN'}={}){const corrected=Number(correctedFrequency),pitch=Number.isFinite(corrected)&&corrected>0?PitchCore.frequencyToPitch(corrected):null;if($('#pitchDebugSource'))$('#pitchDebugSource').textContent=source;if($('#debugRawFrequency'))$('#debugRawFrequency').textContent=Number.isFinite(Number(rawFrequency))?`${Number(rawFrequency).toFixed(2)} Hz`:'—';if($('#debugCorrectedFrequency'))$('#debugCorrectedFrequency').textContent=pitch?`${corrected.toFixed(2)} Hz`:'—';if($('#debugPitchConfidence'))$('#debugPitchConfidence').textContent=Number.isFinite(Number(confidence))?Number(confidence).toFixed(3):'—';if($('#debugMidi'))$('#debugMidi').textContent=pitch?String(pitch.midi):'—';if($('#debugNote'))$('#debugNote').textContent=pitch?pitch.noteName:'—';if($('#debugOctave'))$('#debugOctave').textContent=pitch?String(pitch.octave):'—';if($('#debugSampleRate'))$('#debugSampleRate').textContent=Number.isFinite(Number(sampleRate))?`${Number(sampleRate)} Hz`:'—';if($('#debugDuration'))$('#debugDuration').textContent=Number.isFinite(Number(duration))?`${Number(duration).toFixed(2)} s`:'—';if($('#debugDetector'))$('#debugDetector').textContent=detector}
function resetPitchDebugForTarget(){updatePitchDebug({source:`尚未分析录音 · 当前目标 ${recordingTargetPitch.note} ${recordingTargetPitch.hz.toFixed(2)} Hz`,detector:'等待真人录音'})}
function runPitchCoreTests(){
  const landmarks=[{midi:48,note:'C3',hz:130.8128},{midi:60,note:'C4',hz:261.6256},{midi:72,note:'C5',hz:523.2511},{midi:84,note:'C6',hz:1046.5023}],results=[];
  landmarks.forEach(test=>{const fromMidi=PitchCore.midiToPitch(test.midi),fromFrequency=PitchCore.frequencyToPitch(test.hz);results.push({name:`MIDI ${test.midi} → ${test.note}`,pass:fromMidi.note===test.note});results.push({name:`${test.note} → ${test.hz} Hz`,pass:Math.abs(fromMidi.hz-test.hz)<.0001});results.push({name:`${test.hz} Hz → ${test.note}`,pass:fromFrequency.note===test.note&&fromFrequency.midi===test.midi})});
  const passed=results.filter(result=>result.pass).length,status=$('#pitchTestStatus');if(status){status.textContent=`科学音高自动测试：${passed}/${results.length} ${passed===results.length?'全部通过':'存在失败'}`;status.dataset.state=passed===results.length?'passed':'failed'}console.table(results);return {passed,total:results.length,results};
}
function tenorPresetAtPitch(vowel,pitchHz=recordingTargetPitch.hz){const base=TENOR_VOWEL_PRESETS[vowel];if(!base||!Number.isFinite(pitchHz)||pitchHz<PitchCore.midiToFrequency(48)-.01||pitchHz>PitchCore.midiToFrequency(84)+.01)return null;const rise=Math.max(-24,Math.min(24,12*Math.log2(pitchHz/PitchCore.midiToFrequency(60))));return {...base,jawOpening:clamp(base.jawOpening+Math.max(0,rise)*1.25+Math.min(0,rise)*.35),tongueHeight:clamp(base.tongueHeight-rise*.55),tongueFrontness:clamp(base.tongueFrontness-rise*.35),suprahyoidTension:clamp(base.suprahyoidTension+rise*.35),thyrohyoidTension:clamp(base.thyrohyoidTension+rise*.45),larynxHeight:clamp(base.larynxHeight-rise*.35)}}
function renderPitchSelection(){
  if($('#recordingPitchLabel'))$('#recordingPitchLabel').textContent=pitchLabel($('#newVoicePart').value);
  const maleNotation=isMaleVoicePart($('#newVoicePart').value);if($('#pitchNotationNote'))$('#pitchNotationNote').textContent=maleNotation?'男声显示：音名比钢琴实际音高低一个八度（例如显示 C3，实际播放 C4）。声音、频率和检测结果不移调。':'女声、假声男高音及未指定：音名按实际音高显示。';const range=$('.pitch-picker-heading small');if(range)range.textContent=maleNotation?'C2—C5':'C3—C6';
  const sample=personalVoiceAnalysis()?.vowels?.[state.currentVowel],sampleF0=Number(sample?.measuredF0??sample?.f0),readout=$('#activePitchLabel');if(readout)readout.textContent=sample&&Number.isFinite(sampleF0)&&sampleF0>0?`当前 [${state.currentVowel}] · ${pitchFromHz(sampleF0).note} · ${sampleF0.toFixed(2)} Hz`:`[${state.currentVowel}] · 暂无录音音高`;
  $$('.pitch-option').forEach(button=>{const pitch=pitchFromMidi(Number(button.dataset.midi)),part=$('#newVoicePart').value,active=pitch.midi===recordingTargetPitch.midi;button.querySelector('span').textContent=isMaleVoicePart(part)?pitchFromMidi(pitch.midi-12).note:pitch.note;button.querySelector('small').textContent=`${pitch.hz.toFixed(2)} Hz${pitch.landmark&&!isMaleVoicePart(part)?' · 中央 C':''}`;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
}
function moveHandle(key,x,y){const h=$(`[data-control="${key}"]`); if(!h)return; const circles=h.querySelectorAll('circle');circles.forEach(c=>{c.setAttribute('cx',x);c.setAttribute('cy',y)});const texts=h.querySelectorAll('text');texts.forEach((t,i)=>{if(key==='tongue'){t.setAttribute('x',x+22);t.setAttribute('y',y+(i?12:-7))}else if(key==='jawOpening'){t.setAttribute('x',x+21);t.setAttribute('y',y+5)}else if(key==='lipRounding'){t.setAttribute('x',x-45);t.setAttribute('y',y-27)}else if(key==='velumOpening'){t.setAttribute('x',x+22);t.setAttribute('y',y-5)}else{t.setAttribute('x',x+25);t.setAttribute('y',y+5)}})}
function setParam(key,value){
  state[key]=clamp(Number(value));
  const stage=$('#anatomyStage'),motion=$('#organMotionReadout');
  if(stage){
    stage.dataset.activeOrgan=key==='tongueHeight'||key==='tongueFrontness'?'tongue':key;
    if(motion){const descriptions={tongueHeight:'舌体升降',tongueFrontness:'舌体前后',jawOpening:'下颌开合',lipRounding:'嘴唇圆展',velumOpening:'软腭升降',larynxHeight:'喉部升降',suprahyoidTension:'舌骨上肌群',thyrohyoidTension:'甲状舌骨肌'};motion.textContent=`${descriptions[key]} · ${Math.round(state[key])}`}
    clearTimeout(organHighlightTimer);organHighlightTimer=setTimeout(()=>delete stage.dataset.activeOrgan,1500);
  }
  render();
}
async function selectVowel(vowel,{audition=false}={}){
  if(personalVoicePacks.has(state.voicePackId)&&!hasVoiceVowel(vowel)){showToast(`此声线尚未录制 [${vowel}]，暂无声音和参数`);return}
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
  selectAvailableVoiceVowel();Object.assign(state,vowelPreset(state.currentVowel));
  updateVoiceDeleteButton();if(announce)showToast(`已载入所选声线的 ${availableVoiceVowels().length} 个已录元音`);render();
}
function applyTenorPreset(){const comparison=comparisonPitchForVowel(state.currentVowel),preset=tenorPresetAtPitch(state.currentVowel,comparison.hz);if(!preset){showToast('当前音高超出教学模型范围（C3—C6）');return}clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;pressing=false;locked=false;phonationRequest++;state.isPhonating=false;syncLockUi();Object.assign(state,preset);selectedReferenceId='tenor-model';render();showToast('已载入男高音教学模型；录音声线未改变')}
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
  const sum=ctx.createGain(),inputMeter=ctx.createAnalyser(),nasal=ctx.createBiquadFilter(),notch=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),rounding=ctx.createBiquadFilter(),body=ctx.createBiquadFilter(),f1Filter=ctx.createBiquadFilter(),f2Filter=ctx.createBiquadFilter(),f3Filter=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor(),processedMeter=ctx.createAnalyser(),makeup=ctx.createGain(),master=ctx.createGain(),analyser=ctx.createAnalyser();
  nasal.type='peaking';nasal.frequency.value=280;nasal.Q.value=1.2;notch.type='notch';notch.frequency.value=900;notch.Q.value=2;tone.type='highshelf';tone.frequency.value=1800;rounding.type='lowpass';rounding.frequency.value=7600;rounding.Q.value=.72;body.type='lowshelf';body.frequency.value=520;compressor.threshold.value=-16;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.01;compressor.release.value=.18;master.gain.value=0;analyser.fftSize=2048;analyser.smoothingTimeConstant=.8;
  [f1Filter,f2Filter,f3Filter].forEach((filter,i)=>{filter.type='peaking';filter.Q.value=[4,5,6][i];filter.gain.value=[8,7,5][i]});
  inputMeter.fftSize=1024;processedMeter.fftSize=1024;makeup.gain.value=1;
  sum.connect(inputMeter).connect(nasal).connect(notch).connect(tone).connect(rounding).connect(body).connect(f1Filter).connect(f2Filter).connect(f3Filter).connect(compressor).connect(processedMeter).connect(makeup).connect(master).connect(analyser);
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve});
  audio={ctx,sum,inputMeter,nasal,notch,tone,rounding,body,f1Filter,f2Filter,f3Filter,compressor,processedMeter,makeup,master,analyser,inputSamples:new Uint8Array(inputMeter.fftSize),processedSamples:new Uint8Array(processedMeter.fftSize),lastLevelCheck:0,outputRoute:null,gains:{},sources:[],loopers:{},loopTimer:null,oscillators:[],mode:'samples',raf:null,ready,readyResolve};
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
  audio.nasal.gain.setTargetAtTime(clamp((anchor.velumOpening-state.velumOpening)*.18,-12,12),now,.07);audio.notch.frequency.setTargetAtTime(680+(100-state.velumOpening)*4.2,now,.07);audio.notch.Q.setTargetAtTime(1.2+(100-state.velumOpening)*.075,now,.07);
  const highRounded=highRoundedVowelAmount();
  const toneDb=frontDelta*.22-roundDelta*.13-(state.larynxHeight-anchor.larynxHeight)*.09+(state.suprahyoidTension-30)*.045;
  audio.tone.gain.setTargetAtTime(highRounded?clamp(toneDb,-14+7*highRounded,12):toneDb,now,.07);
  audio.rounding?.frequency.setTargetAtTime(clamp(7800-state.lipRounding*52+state.jawOpening*12,2200+3000*highRounded,9200),now,.07);
  if(!state.isPhonating||!highRounded)audio.makeup.gain.setTargetAtTime(1,now,.2);
  audio.body?.gain.setTargetAtTime(clamp(jawDelta*.11-heightDelta*.055+(state.larynxHeight-anchor.larynxHeight)*.07,-10,10),now,.07);
  audio.f1Filter?.frequency.setTargetAtTime(a.f1,now,.07);audio.f2Filter?.frequency.setTargetAtTime(a.f2,now,.07);audio.f3Filter?.frequency.setTargetAtTime(a.f3,now,.07);
  audio.f1Filter?.gain.setTargetAtTime(clamp(7+Math.abs(jawDelta-heightDelta*.5)*.075,7,13),now,.07);audio.f2Filter?.gain.setTargetAtTime(clamp(6+Math.abs(frontDelta-roundDelta*.4)*.065,6,12),now,.07);audio.f3Filter?.gain.setTargetAtTime(clamp(4+(state.suprahyoidTension+state.thyrohyoidTension-65)*.055,3,10),now,.07);
  audio.master.gain.setTargetAtTime(state.isPhonating&&audio.mode!=='error'?.72:0,now,.035);
}
async function startPhonation(){
  if(personalVoicePacks.has(state.voicePackId)&&!hasVoiceVowel(state.currentVowel)){pressing=false;locked=false;auditionActive=false;state.isPhonating=false;syncLockUi();showToast('当前元音尚未录制，无法发声');return false}
  if(!personalVoicePacks.has(state.voicePackId)){pressing=false;auditionActive=false;locked=false;syncLockUi();$('#voiceDialog').showModal();showToast('请先录制或导入至少一个元音，创建“我的声线”');return false}
  const request=++phonationRequest;
  try{
    await initAudio();await resumeMediaChannel(audio.ctx);
    if(audio.mode==='empty'){
      setAudioState('loading','正在载入已录元音…');
      const currentAudio=audio;
      if(!currentAudio.voiceLoadPromise)currentAudio.voiceLoadPromise=loadVoicePack(state.voicePackId).finally(()=>{currentAudio.voiceLoadPromise=null});
      await currentAudio.voiceLoadPromise;
    }
    if(request!==phonationRequest||(!pressing&&!locked&&!auditionActive)||audio.mode==='error')return false;
    if(audio.ctx.state==='suspended')await audio.ctx.resume();
    state.isPhonating=true;setAudioState('playing',`正在发 [${state.currentVowel}]`);$('#phonateButton').classList.add('is-playing');render();syncLockUi();return true;
  }catch(err){
    console.error('Voice playback failed.',err);auditionActive=false;pressing=false;locked=false;syncLockUi();state.isPhonating=false;
    if(audio)audio.mode='error';setAudioState('error','声音无法播放，请刷新后重试');syncLockUi();showToast('声音加载失败；请刷新网页后重试');return false;
  }
}
function stopPhonation(){if(locked)return;auditionActive=false;phonationRequest++;state.isPhonating=false;setAudioState(audio?'ready':'','等待发声');$('#phonateButton').classList.remove('is-playing');render();syncLockUi()}
function setAudioState(cls,text){const el=$('#audioState');el.className=`audio-state ${cls}`;el.lastElementChild.textContent=text}
function sampleRms(samples){let power=0;for(const sample of samples){const value=(sample-128)/128;power+=value*value}return Math.sqrt(power/samples.length)}
function balanceHighRoundedVowel(currentAudio,frameTime){
  if(frameTime-currentAudio.lastLevelCheck<140)return;
  currentAudio.lastLevelCheck=frameTime;
  const amount=highRoundedVowelAmount();
  if(!state.isPhonating||!amount)return;
  currentAudio.inputMeter.getByteTimeDomainData(currentAudio.inputSamples);
  currentAudio.processedMeter.getByteTimeDomainData(currentAudio.processedSamples);
  const sourceLevel=sampleRms(currentAudio.inputSamples),processedLevel=sampleRms(currentAudio.processedSamples);
  if(sourceLevel<.008||processedLevel<.006)return;
  const ratio=clamp(sourceLevel/processedLevel,.85,1.5);
  currentAudio.makeup.gain.setTargetAtTime(1+(ratio-1)*amount,currentAudio.ctx.currentTime,.28);
}
function drawSpectrum(){
  if(!audio)return;const currentAudio=audio,canvas=$('#spectrumCanvas'),ctx=canvas.getContext('2d'),data=new Uint8Array(currentAudio.analyser.frequencyBinCount);
  const draw=frameTime=>{if(audio!==currentAudio)return;currentAudio.raf=requestAnimationFrame(draw);balanceHighRoundedVowel(currentAudio,frameTime);const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth*dpr,h=canvas.clientHeight*dpr;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}currentAudio.analyser.getByteFrequencyData(data);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#183542';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke()}const bins=Math.min(data.length,Math.floor(5000/(currentAudio.ctx.sampleRate/2)*data.length));ctx.beginPath();for(let i=0;i<bins;i++){const x=i/(bins-1)*w,y=h-(data[i]/255)*(h*.92);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.strokeStyle='#4ce0c1';ctx.lineWidth=2*dpr;ctx.stroke();const level=data.slice(0,bins).reduce((n,v)=>n+v,0)/(bins*255);$$('.level-meter span').forEach((el,i)=>{const active=i/8<level*1.7;el.style.height=`${20+Math.max(0,level*110-i*7)}%`;el.style.background=active?(i>6?'#ff7f8f':i>4?'#ffd166':'#4ce0c1'):'#203945'})};draw(performance.now());
}

function bindControls(){
  $('#comparisonRows').addEventListener('input',event=>{if(event.target.matches('.comparison-slider'))setParam(event.target.dataset.key,event.target.value)});
  $$('.control-row input').forEach(input=>input.addEventListener('input',e=>setParam(e.target.closest('.control-row').dataset.key,e.target.value)));
  $$('.vowel-button').forEach(button=>button.addEventListener('click',()=>selectVowel(button.dataset.vowelSelect)));
  $$('.vowel-anchor').forEach(anchor=>{
    anchor.addEventListener('click',()=>selectVowel(anchor.dataset.vowel));
    anchor.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectVowel(anchor.dataset.vowel)}});
  });
  $('#applyTenorPreset').addEventListener('click',applySelectedReference);
  $('#loadTenorModel').addEventListener('click',applyTenorPreset);
  $('#resetButton').addEventListener('click',restoreOriginalParameters);
  $('#restoreVowelOriginal').addEventListener('click',restoreOriginalParameters);
  const svg=$('#tractSvg');
  $$('.handle').forEach(h=>{h.addEventListener('pointerdown',e=>{dragControl=h.dataset.control;h.setPointerCapture(e.pointerId);e.preventDefault()});h.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?5:2,key=h.dataset.control;if(key==='tongue')setParam(e.key==='ArrowUp'||e.key==='ArrowDown'?'tongueHeight':'tongueFrontness',(e.key==='ArrowUp'||e.key==='ArrowRight'?1:-1)*step+state[e.key==='ArrowUp'||e.key==='ArrowDown'?'tongueHeight':'tongueFrontness']);else {const increase=key==='larynxHeight'?(e.key==='ArrowDown'||e.key==='ArrowRight'):(e.key==='ArrowUp'||e.key==='ArrowRight');setParam(key,state[key]+(increase?step:-step))}})});
  svg.addEventListener('pointermove',e=>{if(!dragControl)return;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());if(dragControl==='tongue'){setParam('tongueFrontness',(p.x-500)/2.2);setParam('tongueHeight',(600-p.y)/2)}else if(dragControl==='jawOpening')setParam('jawOpening',(p.y-690)/.3);else if(dragControl==='lipRounding')setParam('lipRounding',(320-p.x)/.28);else if(dragControl==='velumOpening')setParam('velumOpening',(480-p.y)/.7);else if(dragControl==='suprahyoidTension')setParam('suprahyoidTension',(p.x-620)/1.05);else if(dragControl==='thyrohyoidTension')setParam('thyrohyoidTension',(p.x-748)/.45);else if(dragControl==='larynxHeight')setParam('larynxHeight',(p.y-715)/1.2)});window.addEventListener('pointerup',()=>dragControl=null);
}
function showFormantExplanation(key){
  if(!FORMANT_EXPLANATIONS[key])return;
  $$('.formant-cell').forEach(cell=>{const active=cell.dataset.formant===key;cell.classList.toggle('selected',active);cell.setAttribute('aria-pressed',String(active))});
  $('#formantExplanation').innerHTML=FORMANT_EXPLANATIONS[key];
}
function bindFormantExplainer(){
  $$('.formant-cell').forEach(cell=>{
    cell.title=FORMANT_EXPLANATIONS[cell.dataset.formant].replace(/<br>/g,' ').replace(/<[^>]*>/g,'');
    const select=()=>showFormantExplanation(cell.dataset.formant);
    cell.addEventListener('click',select);
    cell.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select()}});
  });
}
function bindPhonation(){
  $('#phonateButton').addEventListener('click',async()=>{
    clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;
    if(locked){locked=false;stopPhonation();return}
    locked=true;syncLockUi();
    if(!await startPhonation())syncLockUi();
  });
}
function syncLockUi(){const button=$('#phonateButton');button.classList.toggle('is-playing',state.isPhonating);button.setAttribute('aria-pressed',String(locked));button.setAttribute('aria-label',locked?'停止发声':'开始持续发声');$('#phonateLabel').textContent=state.isPhonating?'发声中':locked?'正在准备':'发声';$('#phonateHint').textContent=locked?'点击停止':'点击开始持续发声'}


function discardUnsavedVoiceSamples({refreshStatus=true}={}){
  stopSamplePreview();
  // New recordings always use unshifted detected frequency.
  for(const vowel of Object.keys(personalSamples)){personalSamples[vowel]=null;clearPreviewSample(vowel)}
  $$('.sample-card').forEach(card=>{card.classList.remove('ready','error');card.querySelector('small').textContent='等待样本';const input=card.querySelector('input');if(input)input.value=''});
  if(refreshStatus)updateVoiceSave();
}

let voiceDraftReady=Promise.resolve(),voiceDraftQueue=Promise.resolve(),restoringVoiceDraft=false,voiceDraftRevision=0;
function voiceDraftTransaction(value){return new Promise((resolve,reject)=>{
  const request=indexedDB.open('VocalTractLabDrafts',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>{$('#voiceDraftStatus').textContent='本机保存正在等待其他旧版页面关闭，请关闭同站点的其他标签页。'};
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts',value===undefined?'readonly':'readwrite'),store=tx.objectStore('drafts');let result;
    const operation=value===undefined?store.get('current'):value===null?store.delete('current'):store.put(value,'current');
    operation.onsuccess=()=>{result=operation.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('草稿存储失败'))};
  };
})}
function persistVoiceDraft(){
  if(restoringVoiceDraft)return voiceDraftQueue;
  const samples={};for(const [vowel,preview] of Object.entries(previewSamples))if(preview){const sample=personalSamples[vowel],card=$(`.sample-card[data-vowel="${vowel}"]`);samples[vowel]={blob:preview.blob,duration:sample?.duration,peak:sample?.peak,rms:sample?.rms,analysis:sample?.analysis,accepted:Boolean(sample),message:card.querySelector('small').textContent,error:card.classList.contains('error')}}
  const count=Object.keys(samples).length,revision=++voiceDraftRevision;
  const draft=count?{samples,targetMidi:recordingTargetPitch.midi,name:$('#packName').value,voicePart:$('#newVoicePart').value,manualOctave,pitchAdjustmentVersion:3,savedAt:new Date().toISOString()}:null;
  if(count)$('#voiceDraftStatus').textContent='正在保存本机录音草稿…';
  voiceDraftQueue=voiceDraftQueue.catch(()=>{}).then(async()=>{await voiceDraftTransaction(draft);if(revision===voiceDraftRevision)$('#voiceDraftStatus').textContent=count?`已保存 ${count}/5 段到本机，刷新或关闭后可继续；仅自己可见，尚未上传。`:'录音会自动保存到本机；同一设备、浏览器和网址重新打开可继续。不会自动上传。'}).catch(err=>{console.warn('Voice draft unavailable.',err);if(revision===voiceDraftRevision)$('#voiceDraftStatus').textContent='临时进度保留在当前页面；本机草稿写入失败，请不要刷新或关闭网页。'});return voiceDraftQueue;
}
async function restoreVoiceDraft(){
  try{const draft=await voiceDraftTransaction();if(!draft?.samples)return;restoringVoiceDraft=true;
    recordingTargetPitch=pitchFromMidi(draft.targetMidi);$('#packName').value=draft.name||'我的声线';$('#newVoicePart').value=draft.voicePart||'unspecified';// Restore existing samples without shifting any new recordings.
    for(const [vowel,sample] of Object.entries(draft.samples)){if(!Object.hasOwn(personalSamples,vowel)||!sample.blob)continue;setPreviewSample(vowel,sample.blob);personalSamples[vowel]=sample.accepted?{blob:sample.blob,duration:sample.duration,peak:sample.peak,rms:sample.rms,analysis:normalizeParameterSample(sample.analysis,vowel)}:null;const card=$(`.sample-card[data-vowel="${vowel}"]`);card.classList.toggle('ready',Boolean(sample.accepted));card.classList.toggle('error',Boolean(sample.error));card.querySelector('small').textContent=sample.message||'已恢复本次录音，可试听或重新录制'}
    renderPitchSelection();updateVoiceSave();$('#voiceDraftStatus').textContent='已恢复本机录音草稿，可继续录制剩余元音。草稿不会上传。';
  }catch(err){console.warn('Voice draft restore failed.',err);$('#voiceDraftStatus').textContent='本机录音读取失败，请检查浏览器站点数据权限。';}finally{restoringVoiceDraft=false}
}
function setupVoiceLab(){
  const grid=$('#sampleGrid');grid.innerHTML=['a','e','i','o','u'].map(v=>`<div class="sample-card" data-vowel="${v}"><strong>[${v}]</strong><small>等待样本</small><div class="sample-actions"><button type="button" class="preview" disabled>试听</button><label>导入<input type="file" accept="audio/wav,.wav,audio/*"></label><button type="button" class="record">录制</button></div></div>`).join('');
  $('#pitchKeyboard').innerHTML=NATURAL_PITCH_MIDIS.map(midi=>{const pitch=pitchFromMidi(midi);return `<button class="pitch-option" type="button" data-midi="${midi}" aria-pressed="${midi===recordingTargetPitch.midi}"><strong>${pitch.solfege}</strong><span>${pitch.note}</span><small>${pitch.hz.toFixed(2)} Hz${pitch.landmark?` · ${pitch.landmark}`:''}</small></button>`}).join('');
  $$('.sample-card input').forEach(input=>input.addEventListener('change',e=>validateSample(e.target.closest('.sample-card').dataset.vowel,e.target.files[0])));$$('.sample-card .record').forEach(btn=>btn.addEventListener('click',()=>recordSample(btn.closest('.sample-card').dataset.vowel,btn)));$$('.sample-card .preview').forEach(btn=>btn.addEventListener('click',()=>playSamplePreview(btn.closest('.sample-card').dataset.vowel,btn)));
  $$('.pitch-option').forEach(button=>button.addEventListener('click',()=>selectRecordingPitch(Number(button.dataset.midi))));
  $('#openVoiceLab').onclick=()=>openVoiceDialog(false);$('#openInfo').onclick=()=>$('#infoDialog').showModal();$('#saveVoicePack').onclick=saveVoicePack;$('#exportCurrentVoice').onclick=exportCurrentVoice;$('#playReferencePitch').onclick=()=>playReferencePitch($('#playReferencePitch'));
  $('#deleteVoiceButton').onclick=promptDeleteVoice;$('#cancelDeleteVoice').onclick=()=>$('#deleteVoiceDialog').close();$('#confirmDeleteVoice').onclick=confirmDeleteVoice;
  $('#voiceDialog').addEventListener('close',()=>{cancelRecordingSession();stopSamplePreview();stopReferencePitch();persistVoiceDraft()});
  $('#packName').addEventListener('input',persistVoiceDraft);
  $('#newVoicePart').addEventListener('change',()=>{renderPitchSelection();persistVoiceDraft()});
  $('#clearVoiceDraft').onclick=async()=>{if(recordingPhase==='processing'){showToast('正在分析本段录音，请稍候再清空');return}if(!confirm('清空这次未保存的录音草稿？已保存的声线不会受影响。'))return;cancelRecordingSession();discardUnsavedVoiceSamples();await persistVoiceDraft();$('#voiceDraftStatus').textContent='已清空临时录音，可以重新开始。'};
  voiceDraftReady=restoreVoiceDraft();
  renderPitchSelection();
}
function setupTeachingReport(){
  $('#voicePartSelect').addEventListener('change',async event=>{
    const pack=personalVoicePacks.get(state.voicePackId);if(!pack)return;
    const part=VOICE_PARTS[event.target.value]?event.target.value:'unspecified';voicePartOverrides[pack.id]=part;pack.voicePart=part;
    try{localStorage.setItem('vocalLabVoiceParts',JSON.stringify(voicePartOverrides));if(pack.source!=='bundled')await dbPut('voicePacks',pack)}catch(err){console.warn('Voice-part label could not be persisted.',err);showToast('声部已更新，但本机存储未成功；刷新后可能恢复')}
    if(selectedReferenceId==='tenor-model'&&part!=='tenor'&&part!=='unspecified')selectedReferenceId='none';
    referenceOptionsKey='';const option=$('#voiceSelect').selectedOptions[0];if(option)option.textContent=voiceOptionLabel(pack);render();
  });
  $('#referenceVoiceSelect').addEventListener('change',event=>{selectedReferenceId=event.target.value;try{localStorage.setItem('vocalLabReference',selectedReferenceId)}catch{}render()});
  $('#importReferencePack').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(file)await importReferencePack(file)});
  $('#importResearchCsv').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(file)await importResearchCsv(file)});
  $('#downloadResearchTemplate').addEventListener('click',()=>{const csv='\ufeffsource,license,singerId,voicePart,vowel,f0,f1,f2,f3\r\n',url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='声部参考数据_空白模板.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  $('#deleteResearchDataset').addEventListener('click',async()=>{if(!selectedReferenceId.startsWith('data:'))return;const id=selectedReferenceId.slice(5).split(':')[0],dataset=researchDatasets.get(id);if(!dataset||!confirm(`删除本机研究数据“${dataset.name}”的 ${dataset.rows.length} 行？该操作不会删除录音声线。`))return;try{await dbDelete('referenceDatasets',id);researchDatasets.delete(id);selectedReferenceId='none';localStorage.setItem('vocalLabReference','none');referenceOptionsKey='';render();showToast('已删除本机研究参考数据')}catch(err){console.error('Research data deletion failed.',err);showToast('删除失败，请检查本机存储')}});
  $('#downloadTeachingReport').addEventListener('click',()=>{if(!latestTeachingReport)return;const url=URL.createObjectURL(new Blob(['\ufeff'+latestTeachingReport],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`元音教学报告_${state.currentVowel}_${new Date().toISOString().slice(0,10)}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  $('#applyReportReference').addEventListener('click',()=>{const comparison=comparisonPitchForVowel(state.currentVowel),reference=reportReference(state.currentVowel,comparison.hz),part=voicePartOf(personalVoicePacks.get(state.voicePackId));if(!reference.params||reference.kind==='recorded'&&comparison.source!=='sample'||reference.kind==='model'&&!['tenor','unspecified'].includes(part))return;clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;pressing=false;locked=false;phonationRequest++;state.isPhonating=false;syncLockUi();Object.assign(state,reference.params);render();showToast(`已载入“${reference.label}”教学构形；声线不变、当前静音`)});
}
function parseCsvMatrix(input){
  const rows=[];let row=[],field='',quoted=false;for(let i=0;i<input.length;i++){const char=input[i];if(quoted){if(char==='"'&&input[i+1]==='"'){field+='"';i++}else if(char==='"')quoted=false;else field+=char}else if(char==='"'){if(field.trim())throw Error('CSV 引号位置不正确');quoted=true}else if(char===','){row.push(field.trim());field=''}else if(char==='\n'){row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field=''}else if(char!=='\r')field+=char}if(quoted)throw Error('CSV 有未闭合的引号');row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows
}
async function importResearchCsv(file){
  const status=$('#reportImportStatus');status.textContent='正在检查研究参考数据…';try{if(file.size>2*1024*1024)throw Error('CSV 文件超过 2 MB');const bytes=new Uint8Array(await file.arrayBuffer()),rows=parseResearchCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),checksum=await audioFingerprint(bytes),existing=[...researchDatasets.values()].find(dataset=>dataset.checksum===checksum);if(existing){status.textContent=`“${existing.name}”已导入过，无需重复添加。`;return}const id=`research-${crypto.randomUUID()}`,name=file.name.replace(/\.csv$/i,'').trim().slice(0,50)||'研究参考数据',dataset={id,name,checksum,createdAt:new Date().toISOString(),rows};await dbPut('referenceDatasets',dataset);researchDatasets.set(id,dataset);const firstPart=rows[0].voicePart;selectedReferenceId=`data:${id}:${firstPart}`;try{localStorage.setItem('vocalLabReference',selectedReferenceId)}catch{}referenceOptionsKey='';render();status.textContent=`已导入“${name}”：${rows.length} 行、${new Set(rows.map(row=>`${row.source}\u0000${row.singerId}`)).size} 位歌者标识；仅保存在本机，来源信息未经本站核验。`;showToast('研究参考数据已导入，可进行同元音、相近音高比较')}catch(err){console.error('Research data import failed.',err);status.textContent=`导入失败：${err.message||'请检查 CSV 编码和字段'}`}
}
async function audioFingerprint(bytes){
  if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes);return 'sha256:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}
  let first=2166136261,second=2246822519;for(const byte of bytes){first=Math.imul(first^byte,16777619);second=Math.imul(second+byte,3266489917)}return `content:${bytes.length}:${(first>>>0).toString(16)}:${(second>>>0).toString(16)}`
}
async function importReferencePack(file){
  const status=$('#reportImportStatus')||$('#recordStatus');status.textContent='正在读取并检查参考声线…';
  if(file.size>32*1024*1024){status.textContent='文件超过 32 MB；请导入本站导出的声线文件。';return}
  let ctx;
  try{
    const payload=JSON.parse(await file.text()),vowels=['a','e','i','o','u'];
    if(payload.format!=='vocal-tract-lab-voice-pack'||payload.version!==1||!Array.isArray(payload.samples)||(payload.samples.length<1||payload.samples.length>5))throw Error('格式不符；请选择本站导出的 .vocalpack.json 文件');
    const byVowel=new Map(payload.samples.map(sample=>[sample.vowel,sample]));if(byVowel.size!==payload.samples.length||[...byVowel.keys()].some(v=>!vowels.includes(v)))throw Error('参考声线须含 1–5 段不重复的有效元音');
    const targetMidi=Number(payload.pack?.analysis?.targetPitch?.midi),targetPitch=Number.isInteger(targetMidi)&&targetMidi>=24&&targetMidi<=108?pitchFromMidi(targetMidi):null;
    ctx=new (window.AudioContext||window.webkitAudioContext)();const id=`personal-${crypto.randomUUID()}`,prepared={},records=[];
    for(const vowel of vowels.filter(v=>byVowel.has(v))){
      const item=byVowel.get(vowel);if(typeof item.data!=='string'||!/^data:audio\/[\w.+-]+;base64,/.test(item.data)||item.data.length>10*1024*1024)throw Error(`[${vowel}] 音频数据缺失或过大`);
      const encoded=item.data.slice(item.data.indexOf(',')+1),binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const type=typeof item.type==='string'&&item.type.startsWith('audio/')?item.type:'audio/wav',blob=new Blob([bytes],{type}),buffer=await ctx.decodeAudioData(bytes.buffer.slice(0));
      if(buffer.duration<2.5||buffer.duration>7)throw Error(`[${vowel}] 长度需为 3–6 秒`);
      const data=analysisChannel(buffer),{peak,rms}=sampleQuality(data);if(peak>.995||rms<.015)throw Error(`[${vowel}] 存在削波或音量过低，请使用更清晰的原始录音`);
      const analysis=await analyzeVoiceSampleAsync(buffer,vowel,targetPitch?.hz??null);analysis.audioChecksum=await audioFingerprint(bytes);prepared[vowel]={analysis};records.push({id:`${id}-${vowel}`,packId:id,vowel,blob,duration:buffer.duration,analysis});
    }
    const inferredPitch=targetPitch||pitchFromHz(median(records.map(record=>record.analysis.f0))),analysis=buildPersonalAnalysis(prepared,inferredPitch),chosen=$('#importVoicePart')?.value||'unspecified',part=chosen!=='unspecified'&&VOICE_PARTS[chosen]?chosen:VOICE_PARTS[payload.pack?.voicePart]?payload.pack.voicePart:'unspecified',name=String(payload.pack?.name||file.name.replace(/\.vocalpack\.json$/i,'')).trim().slice(0,30)||'导入的参考声线';
    const manifest={id,name,voicePart:part,createdAt:new Date().toISOString(),f0:analysis.f0,source:'local',importedFrom:String(payload.pack?.name||'外部文件').slice(0,60),originalSource:String(payload.pack?.originalSource||payload.pack?.attribution||'').slice(0,160),originalLicense:String(payload.pack?.originalLicense||payload.pack?.license||'').slice(0,80),analysis,vowels:{}};
    records.forEach(record=>{manifest.vowels[record.vowel]={duration:record.duration,type:record.blob.type,size:record.blob.size,analysis:record.analysis}});
    await dbSaveVoicePack(manifest,records);addVoiceOption(manifest);selectedReferenceId=id;try{localStorage.setItem('vocalLabReference',id)}catch{}referenceOptionsKey='';render();status.textContent=`已导入“${name}”的 ${records.length} 个元音；仅保存在本机。`;showToast('参考声线已导入，可在同音高下比较');
  }catch(err){console.error('Reference voice import failed.',err);status.textContent=`导入失败：${err.message||'请检查文件及浏览器音频格式支持'}`}
  finally{if(ctx)ctx.close().catch(()=>{})}
}
function centerRecordingPitch(){
  const keyboard=$('#pitchKeyboard'),selected=$('.pitch-option.active');
  if(!keyboard||!selected)return;
  const listRect=keyboard.getBoundingClientRect(),selectedRect=selected.getBoundingClientRect();
  keyboard.scrollTop+=selectedRect.top-listRect.top-keyboard.clientTop-(keyboard.clientHeight-selectedRect.height)/2;
}
async function openVoiceDialog(focusPitch){
  await voiceDraftReady;
  const dialog=$('#voiceDialog');if(!dialog.open)dialog.showModal();renderPitchSelection();
  if(!Object.values(personalSamples).some(Boolean)&&!Object.values(previewSamples).some(Boolean))resetPitchDebugForTarget();
  requestAnimationFrame(()=>{
    centerRecordingPitch();
    if(focusPitch){$('#pitchPicker').scrollIntoView({block:'center',behavior:'smooth'});$('.pitch-option.active')?.focus({preventScroll:true})}
  });
}
function selectRecordingPitch(midi){
  if(!NATURAL_PITCH_MIDIS.includes(midi)){showToast('请选择C3—C6列表中的音高');return}
  if(recordingPhase!=='idle'){showToast('请先结束当前录音再切换音高');return}
  if(midi===recordingTargetPitch.midi){resetPitchDebugForTarget();return}
  if(Object.values(previewSamples).some(Boolean)&&!confirm('切换目标音高需要清空这次录音草稿，是否继续？'))return;
  stopReferencePitch();recordingTargetPitch=pitchFromMidi(midi);
  const hadSamples=Object.values(personalSamples).some(Boolean)||Object.values(previewSamples).some(Boolean);discardUnsavedVoiceSamples();persistVoiceDraft();render();
  resetPitchDebugForTarget();$('#recordStatus').textContent=`已选择 ${pitchLabel()}。本条声线的元音均使用这个音高，可只录其中一个。`;showToast(`${hadSamples?'已清除之前的样本；':''}目标音高已改为 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}`);
}
function stopReferencePitch(){
  const tone=referenceTone;if(!tone||tone.finished)return;
  tone.finished=true;for(const oscillator of [...(tone.oscillators||[]),...(tone.sources||[])]){try{oscillator.stop()}catch{}}
  releaseMediaChannel(tone.ctx);tone.ctx.close().catch(()=>{});
  tone.button.disabled=false;tone.button.textContent=tone.originalText;tone.button.dataset.audioState='ready';
  if(referenceTone===tone)referenceTone=null;if(referenceAudioContext===tone.ctx)referenceAudioContext=null;
  setAudioState(audio?.mode==='personal'?'ready':'',audio?.mode==='personal'?'我的声线已就绪':'等待发声');
}
function median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2}
function runPitchDetectionSelfTests(coreResult=runPitchCoreTests()){
  const results=[],synthesize=(frequency,sampleRate,weights)=>{const length=Math.floor(sampleRate*.9),signal=new Float32Array(length);for(let i=0;i<length;i++){const time=i/sampleRate,envelope=Math.min(1,i/(sampleRate*.03),(length-i)/(sampleRate*.03));signal[i]=envelope*weights.reduce((sum,weight,index)=>sum+weight*Math.sin(2*Math.PI*frequency*(index+1)*time),0)}return signal},test=(name,midi,sampleRate,weights,targetMidi=midi)=>{const expected=PitchCore.midiToPitch(midi),signal=synthesize(expected.hz,sampleRate,weights),detected=estimateF0(signal,sampleRate,PitchCore.midiToFrequency(targetMidi)),cents=1200*Math.log2(detected.frequency/expected.hz);results.push({name,pass:Math.abs(cents)<25,expected:expected.hz,detected:detected.frequency,cents:Number(cents.toFixed(1)),mcleod:detected.mcleodFrequency,yin:detected.yinFrequency})};
  for(const midi of [48,60,72])test(`强第二谐波人声 ${PitchCore.midiToPitch(midi).note}`,midi,48000,[.2,.5,.25,.14,.09]);
  test('真实 C3 不因目标 C4 被强制升八度',48,48000,[.2,.5,.25,.14,.09],60);
  test('弱基频 C4 仍识别为 C4',60,48000,[.035,.56,.24,.13,.08,.05]);
  test('44.1 kHz 录音中的 C4 仍识别为 C4',60,44100,[.12,.48,.25,.14,.09]);
  {const sampleRate=48000,frequency=PitchCore.midiToFrequency(62),length=Math.floor(sampleRate*.9),signal=new Float32Array(length);for(let i=0;i<length;i++){const time=i/sampleRate;signal[i]=.055*Math.sin(Math.PI*frequency*time)+.58*Math.sin(2*Math.PI*frequency*time)+.25*Math.sin(4*Math.PI*frequency*time)+.12*Math.sin(6*Math.PI*frequency*time)}const detected=estimateF0(signal,sampleRate,frequency),cents=1200*Math.log2(detected.frequency/frequency);results.push({name:'含微弱半频周期的 D4 仍识别为 D4',pass:Math.abs(cents)<25,expected:frequency,detected:detected.frequency,cents:Number(cents.toFixed(1))})}
  {const c3=PitchCore.midiToFrequency(48),c4=PitchCore.midiToFrequency(60),raised=applyHumanOctaveAssist(c3,c4,true),kept=applyHumanOctaveAssist(c3,c3,true),unrelated=applyHumanOctaveAssist(PitchCore.midiToFrequency(55),c4,true);results.push({name:'目标 C4 时真实 C3 保持不变',pass:!raised.applied&&Math.abs(raised.frequency-c3)<.02,expected:c3,detected:raised.frequency});results.push({name:'目标 C3 时真实 C3 不升八度',pass:!kept.applied&&Math.abs(kept.frequency-c3)<.02,expected:c3,detected:kept.frequency});results.push({name:'不同目标不会强制修改检测值',pass:!unrelated.applied,expected:c4,detected:unrelated.frequency})}
  const all=[...coreResult.results,...results],passed=all.filter(result=>result.pass).length,status=$('#pitchTestStatus');if(status){status.textContent=`科学音高与人声谐波自动测试：${passed}/${all.length} ${passed===all.length?'全部通过':'存在失败'}`;status.dataset.state=passed===all.length?'passed':'failed'}console.table(results);return {passed,total:all.length,results:all};
}
function lpcCoefficients(frame,order){
  const r=new Float64Array(order+1);for(let lag=0;lag<=order;lag++){let sum=0;for(let i=lag;i<frame.length;i++)sum+=frame[i]*frame[i-lag];r[lag]=sum}
  if(r[0]<1e-8)throw Error('录音能量过低');const a=new Float64Array(order+1);a[0]=1;let error=r[0];
  for(let i=1;i<=order;i++){let acc=r[i];for(let j=1;j<i;j++)acc+=a[j]*r[i-j];const reflection=-acc/Math.max(error,1e-12),previous=a.slice();a[i]=reflection;for(let j=1;j<i;j++)a[j]=previous[j]+reflection*previous[i-j];error*=Math.max(.001,1-reflection*reflection)}return a;
}
function lowpassFrame(data,sampleRate,targetRate,centerFraction,length){
  const result=new Float64Array(length),cutoff=Math.min(1,targetRate/sampleRate),radius=18,center=data.length*centerFraction;
  for(let j=0;j<length;j++){const position=center+(j-(length-1)/2)*sampleRate/targetRate,start=Math.ceil(position-radius);let sum=0,weightSum=0;for(let index=start;index<=position+radius;index++){if(index<0||index>=data.length)continue;const distance=index-position,scaled=Math.PI*cutoff*distance,sinc=Math.abs(scaled)<1e-10?1:Math.sin(scaled)/scaled,window=.5+.5*Math.cos(Math.PI*distance/radius),weight=cutoff*sinc*window;sum+=data[index]*weight;weightSum+=weight}result[j]=weightSum?sum/weightSum:0}return result
}
function lpcPoleFrequencies(coefficients,sampleRate,ceiling){
  const count=coefficients.length-1,roots=Array.from({length:count},(_,index)=>{const angle=2*Math.PI*(index+.11)/count;return {re:.91*Math.cos(angle),im:.91*Math.sin(angle)}});
  for(let iteration=0;iteration<80;iteration++){const next=[],previous=roots.map(root=>({...root}));let largest=0;for(let index=0;index<count;index++){const z=previous[index];let numerator={re:1,im:0};for(let k=1;k<=count;k++)numerator={re:numerator.re*z.re-numerator.im*z.im+coefficients[k],im:numerator.re*z.im+numerator.im*z.re};let denominator={re:1,im:0};for(let other=0;other<count;other++){if(other===index)continue;const deltaRe=z.re-previous[other].re,deltaIm=z.im-previous[other].im;denominator={re:denominator.re*deltaRe-denominator.im*deltaIm,im:denominator.re*deltaIm+denominator.im*deltaRe}}const scale=denominator.re**2+denominator.im**2;if(scale<1e-18){next.push(z);continue}const changeRe=(numerator.re*denominator.re+numerator.im*denominator.im)/scale,changeIm=(numerator.im*denominator.re-numerator.re*denominator.im)/scale;largest=Math.max(largest,Math.hypot(changeRe,changeIm));next.push({re:z.re-changeRe,im:z.im-changeIm})}roots.splice(0,count,...next);if(largest<1e-8)break}
  return roots.map(root=>{const magnitude=Math.hypot(root.re,root.im),frequency=Math.atan2(root.im,root.re)*sampleRate/(2*Math.PI),bandwidth=-sampleRate/Math.PI*Math.log(Math.max(magnitude,1e-12));return {frequency,bandwidth}}).filter(pole=>pole.frequency>100&&pole.frequency<ceiling-50&&pole.bandwidth>0&&pole.bandwidth<600).sort((a,b)=>a.frequency-b.frequency)
}
function buildPersonalAnalysis(samples,targetPitch=recordingTargetPitch){
  const vowels={};for(const [v,sample] of Object.entries(samples)){const measured=sample.analysis,base=VOWELS[v],preset=VOWEL_PRESETS[v],f1Delta=measured.f1-base.f1,f2Delta=measured.f2-base.f2,f3Delta=measured.f3-base.f3,params=usableFormants(measured)?{...preset,tongueHeight:clamp(preset.tongueHeight-f1Delta/6),jawOpening:clamp(preset.jawOpening+f1Delta/8),tongueFrontness:clamp(preset.tongueFrontness+f2Delta/22),lipRounding:clamp(preset.lipRounding-f2Delta/28),larynxHeight:clamp(preset.larynxHeight-f3Delta/25)}:{...preset};vowels[v]={...measured,params,parameterModelVersion:PARAMETER_MODEL_VERSION}}return {f0:Number(median(Object.values(vowels).map(v=>v.f0)).toFixed(2)),targetPitch:{...targetPitch},vowels,method:'MPM + YIN 连续多帧独立检测；多配置 LPC 质量核验；手动调整单独记录',pitchAlgorithm:'mpm-yin-track-v9',parameterModelVersion:PARAMETER_MODEL_VERSION};
}
function stopSamplePreview(){if(!previewAudio)return;const {element,button}=previewAudio;try{element.pause();element.src=''}catch{}if(button){button.textContent='试听';button.classList.remove('playing')}previewAudio=null}
function setPreviewSample(vowel,file){stopSamplePreview();const previous=previewSamples[vowel];if(previous?.url)URL.revokeObjectURL(previous.url);const url=URL.createObjectURL(file);previewSamples[vowel]={blob:file,url};const button=$(`.sample-card[data-vowel="${vowel}"] .preview`);if(button){button.disabled=false;button.textContent='试听'}}
async function playSamplePreview(vowel,button){
  const sample=previewSamples[vowel];if(!sample)return;if(previewAudio?.button===button){stopSamplePreview();return}stopSamplePreview();const element=new Audio(sample.url);element.setAttribute('playsinline','');element.setAttribute('webkit-playsinline','');previewAudio={element,button};button.textContent='停止';button.classList.add('playing');element.onended=stopSamplePreview;element.onerror=()=>{stopSamplePreview();showToast('这段录音暂时无法播放，请重新录制或导入')};try{await element.play()}catch(err){console.error('Sample preview failed.',err);stopSamplePreview();showToast('试听未能开始，请调高媒体音量后重试')}
}
function clearPreviewSample(vowel){const sample=previewSamples[vowel];if(sample?.url)URL.revokeObjectURL(sample.url);previewSamples[vowel]=null;const button=$(`.sample-card[data-vowel="${vowel}"] .preview`);if(button){button.disabled=true;button.textContent='试听'}}
let recorder=null,recordChunks=[],recordTimer=null,recordClock=null,recordingStartedAt=0,recordStream=null,recordButton=null,recordingPhase='idle',recordingToken=0,discardRecording=false,recordingMeter=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setRecordingMonitor(state,title,time='00:00.0',level='麦克风尚未启用'){
  const monitor=$('#recordingMonitor');if(!monitor)return;monitor.dataset.state=state;$('#recordingTitle').textContent=title;$('#recordingTime').textContent=time;$('#recordingLevelText').textContent=level;
}
function setRecordButtons(active,text){$$('.sample-card .record').forEach(button=>{button.disabled=Boolean(active)&&button!==active;if(button===active&&text)button.textContent=text;else if(!active)button.textContent='录制'})}
function formatRecordingTime(ms){const total=Math.max(0,ms)/1000,minutes=Math.floor(total/60),seconds=Math.floor(total%60),tenths=Math.floor((total%1)*10);return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${tenths}`}
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
  persistVoiceDraft();
  const ready=Object.entries(personalSamples).filter(([,sample])=>Boolean(sample)).map(([vowel])=>vowel),missing=Object.keys(personalSamples).filter(vowel=>!personalSamples[vowel]),button=$('#saveVoicePack');
  button.disabled=ready.length===0||recordingPhase!=='idle';
  if(recordingPhase!=='idle')return;
  if(ready.length){const f0=Math.round(median(Object.values(personalSamples).filter(Boolean).map(sample=>sample.analysis.f0))),cents=Math.round(1200*Math.log2(f0/recordingTargetPitch.hz));$('#recordStatus').textContent=`已完成 ${ready.length}/5 个元音，可直接保存 · 目标 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note} · 中位 F0 ${f0} Hz · 偏差 ${cents>0?'+':''}${cents} 音分；可以保存。`}else $('#recordStatus').textContent=`目标 ${recordingTargetPitch.solfege} ${recordingTargetPitch.note}；录制任意一个元音即可保存，未录元音不提供声音或参数。`;
}
async function saveVoicePack(){
  const button=$('#saveVoicePack'),samples=Object.fromEntries(Object.entries(personalSamples).filter(([,sample])=>Boolean(sample)));
  if(recordingPhase!=='idle'||!Object.keys(samples).length){$('#recordStatus').textContent='请先完成至少一个元音的录制与分析。';return}
  const id=`personal-${Date.now()}`,name=$('#packName').value.trim()||`我的声线 ${personalVoicePacks.size+1}`,analysis=buildPersonalAnalysis(samples),voicePart=VOICE_PARTS[$('#newVoicePart').value]?$('#newVoicePart').value:'unspecified',manifest={id,name,voicePart,createdAt:new Date().toISOString(),f0:analysis.f0,source:'local',analysis,vowels:{}},records=[];
  for(const [v,s] of Object.entries(samples)){manifest.vowels[v]={duration:s.duration,type:s.blob.type||'audio/wav',size:s.blob.size,analysis:s.analysis};records.push({id:`${id}-${v}`,packId:id,vowel:v,blob:s.blob,duration:s.duration,analysis:s.analysis})}
  button.disabled=true;button.textContent='正在保存…';$('#recordStatus').textContent='正在保存到这台设备，请稍候…';
  try{await dbSaveVoicePack(manifest,records)}catch(err){console.error('Voice pack save failed.',err);button.textContent='保存到本机声线';button.disabled=false;$('#recordStatus').textContent='保存失败：浏览器未能写入本机存储。请确认没有使用无痕模式，并为此页面允许站点数据。';showToast('个人声线保存失败，录音仍保留在当前窗口');return}
  addVoiceOption(manifest,{select:true});selectAvailableVoiceVowel();Object.assign(state,vowelPreset(state.currentVowel));render();button.textContent='保存到本机声线';$('#voiceDialog').close();showToast(`“${name}”已保存到本机；刷新后仍可选择，尚未上传`);
  if(audio){try{stopAndClearAudio();await loadVoicePack(id)}catch(err){console.warn('Saved voice pack could not be loaded immediately.',err);setAudioState('error','声线已保存 · 载入失败');showToast('声线已保存；重新选择该声线即可再次载入')}}
  discardUnsavedVoiceSamples();await voiceDraftQueue;$('#packName').value=`我的声线 ${personalVoicePacks.size+1}`;$('#newVoicePart').value='unspecified';
  try{await navigator.storage?.persist?.()}catch(err){console.warn('Persistent storage request unavailable.',err)}
  if($('#offerVoiceSubmission')?.checked){$('#offerVoiceSubmission').checked=false;window.VocalVoiceCloud?.open()}
}
window.getVoiceCloudSubmission=async()=>{
  const pack=personalVoicePacks.get(state.voicePackId);
  if(!pack||pack.source==='bundled')throw Error('请先选择你在本机录制并保存的个人声线；内置声线不能提交。');
  const records=(await dbAll('voiceSamples')).filter(record=>record.packId===pack.id);
  if(!records.length||records.length!==availableVoiceVowels().length)throw Error('已录元音样本缺失，请重新保存声线。');
  const samples=[];for(const r of records)samples.push({vowel:r.vowel,duration:r.duration,type:r.blob.type||'audio/webm',analysis:r.analysis,data:await blobToDataUrl(r.blob)});
  return {pack,samples};
};
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function exportCurrentVoice(){const pack=personalVoicePacks.get(state.voicePackId);if(!pack){showToast('当前还没有可导出的个人声线');return}if(pack.source==='bundled'){showToast('初始声线已经随网站提供，无需再次导出');return}const button=$('#exportCurrentVoice');button.disabled=true;button.textContent='正在导出…';try{const records=(await dbAll('voiceSamples')).filter(record=>record.packId===pack.id);if(!records.length||records.length!==availableVoiceVowels().length)throw Error('当前声线的已录样本缺失');const samples=[];for(const record of records)samples.push({id:record.id,packId:record.packId,vowel:record.vowel,duration:record.duration,analysis:record.analysis,type:record.blob.type||'audio/webm',data:await blobToDataUrl(record.blob)});const payload={format:'vocal-tract-lab-voice-pack',version:1,exportedAt:new Date().toISOString(),pack,samples},link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));link.download=`${pack.name.replace(/[\\/:*?"<>|]/g,'_')}.vocalpack.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);showToast(`已导出“${pack.name}”的 ${records.length} 个元音`)}catch(err){console.error('Voice export failed.',err);showToast(`导出失败：${err.message}`)}finally{button.disabled=false;button.textContent='导出当前声线'}}
async function loadVoicePack(id){
  const pack=personalVoicePacks.get(id);if(!pack)throw Error('找不到所选声线');if(!audio)await initAudio();clearAudioVoices();
  if(pack.source==='bundled'){
    for(const [vowel,item] of Object.entries(pack.vowels)){let encoded;if(item.audioPath.startsWith('data:')){const base64=item.audioPath.slice(item.audioPath.indexOf(',')+1),binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);encoded=bytes.buffer}else{const response=await fetch(item.audioPath);if(!response.ok)throw Error(`初始声线 [${vowel}] 加载失败`);encoded=await response.arrayBuffer()}const buffer=await audio.ctx.decodeAudioData(encoded);createLoopSource(vowel,buffer)}
  }else{
    const records=(await dbAll('voiceSamples')).filter(r=>r.packId===id);if(!records.length||records.length!==availableVoiceVowels(id).length)throw Error('个人声线已录样本缺失');
    for(const record of records){const buffer=await audio.ctx.decodeAudioData(await record.blob.arrayBuffer());createLoopSource(record.vowel,buffer)}
  }
  audio.mode='personal';setAudioState('ready',pack.source==='bundled'?'内置声线已就绪':'个人声线已就绪');render()
}
function clearAudioVoices(){
  if(!audio)return;clearInterval(audio.loopTimer);audio.loopTimer=null;audio.sources.forEach(source=>{try{source.stop()}catch{}});audio.oscillators.forEach(source=>{try{source.stop()}catch{}});audio.sources=[];audio.loopers={};audio.gains={};audio.oscillators=[];
}
function stopAndClearAudio(){if(!audio)return;cancelAnimationFrame(audio.raf);clearAudioVoices();const ctx=audio.ctx;releaseMediaChannel(ctx);try{ctx.close()}catch{}audio=null}
function addVoiceOption(pack,{select=false}={}){pack=normalizeVoiceParameterPack(pack);personalVoicePacks.set(pack.id,pack);const voiceSelect=$('#voiceSelect');voiceSelect.querySelector(`option[value="${PERSONAL_EMPTY_ID}"]`)?.remove();let opt=[...voiceSelect.options].find(option=>option.value===pack.id);if(!opt){opt=document.createElement('option');opt.value=pack.id;voiceSelect.append(opt)}opt.textContent=voiceOptionLabel(pack);voiceSelect.disabled=false;if(select){voiceSelect.value=pack.id;state.voicePackId=pack.id}referenceOptionsKey='';updateVoiceDeleteButton()}
function updateVoiceDeleteButton(){const pack=personalVoicePacks.get(state.voicePackId),button=$('#deleteVoiceButton');button.hidden=!pack||pack.source==='bundled';button.disabled=!pack||pack.source==='bundled'}
function promptDeleteVoice(){const pack=personalVoicePacks.get(state.voicePackId);if(!pack||pack.source==='bundled')return;$('#deleteVoiceMessage').textContent=`“${pack.name}”保存在这台设备的录音和分析结果将被删除，无法撤销。删除前可在“添加声线”中导出备份。网站内置的创始人声线不会受影响。`;$('#deleteVoiceDialog').showModal()}
async function confirmDeleteVoice(){const pack=personalVoicePacks.get(state.voicePackId),button=$('#confirmDeleteVoice');if(!pack||pack.source==='bundled'){$('#deleteVoiceDialog').close();return}button.disabled=true;try{await dbDeleteVoicePack(pack.id);personalVoicePacks.delete(pack.id);[...$('#voiceSelect').options].find(option=>option.value===pack.id)?.remove();if(selectedReferenceId===pack.id)selectedReferenceId='none';referenceOptionsKey='';$('#deleteVoiceDialog').close();const fallback=personalVoicePacks.has(DEFAULT_VOICE_ID)?DEFAULT_VOICE_ID:personalVoicePacks.keys().next().value;await switchVoice(fallback,{announce:false});showToast(`已删除“${pack.name}”的本机录音`)}catch(err){console.error('Voice deletion failed.',err);showToast('删除失败，请检查浏览器存储空间后重试')}finally{button.disabled=false}}
async function loadVoicePacks(){try{const response=await fetch('./assets/second-voice.json',{cache:'no-cache'});if(!response.ok)throw Error(`内置声线清单 ${response.status}`);addVoiceOption(await response.json(),{select:true})}catch(err){console.warn('Bundled voice unavailable.',err)}try{const packs=(await dbAll('voicePacks')).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));packs.forEach(pack=>{if(pack.id!=='default-personal'&&!personalVoicePacks.has(pack.id))addVoiceOption(pack,{select:!personalVoicePacks.size})})}catch(err){console.warn('Local voice storage unavailable.',err)}if(!personalVoicePacks.size){$('#voiceSelect').disabled=true;$('#voiceSelect').options[0].textContent='声线加载失败，请刷新或添加声线'}$('#voiceSelect').addEventListener('change',e=>switchVoice(e.target.value));updateVoiceDeleteButton()}

function bindMobileTabs(){
  const layout=$('#mobileLayout'),anchor=$('#mobileStageAnchor'),stage=$('#anatomyStage'),dock=$('#phonationDock'),anatomyPanel=$('[data-panel="anatomy"]'),vowels=$('.vowel-switcher');
  const mobileQuery=window.matchMedia('(max-width: 780px), (max-width: 950px) and (orientation: landscape)');
  const placeStage=()=>{
    if(mobileQuery.matches){if(stage.parentElement!==anchor)anchor.append(stage,dock)}
    else if(stage.parentElement!==anatomyPanel){anatomyPanel.insertBefore(stage,vowels);anatomyPanel.append(dock)}
  };
  const selectTab=name=>{
    layout.dataset.mobileView=name==='acoustics'?'acoustics':'practice';
    $$('.mobile-tabs [data-tab]').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
    $$('[data-panel]').forEach(panel=>panel.classList.toggle('active',name==='acoustics'?panel.dataset.panel==='acoustics':panel.dataset.panel!=='acoustics'));
    if(name==='anatomy'){
      $('[data-panel="controls"]').dataset.controlView='sliders';
      $$('.mobile-control-modes button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.controlView==='sliders')));
    }
    if(mobileQuery.matches){layout.classList.remove('stage-collapsed');const toggle=$('#toggleMobileStage');toggle.setAttribute('aria-expanded','true');toggle.textContent='收起图'}
  };
  $$('.mobile-tabs [data-tab]').forEach(button=>button.addEventListener('click',()=>{
    selectTab(button.dataset.tab);
    if(mobileQuery.matches){const target=$(`[data-panel="${button.dataset.tab}"]`);requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}))}
  }));
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
function getDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('VocalTractLab',2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});if(!db.objectStoreNames.contains('voicePacks'))db.createObjectStore('voicePacks',{keyPath:'id'});if(!db.objectStoreNames.contains('voiceSamples'))db.createObjectStore('voiceSamples',{keyPath:'id'});if(!db.objectStoreNames.contains('referenceDatasets'))db.createObjectStore('referenceDatasets',{keyPath:'id'})};req.onblocked=()=>{const message='本机数据升级正在等待其他旧版页面关闭；请关闭同站点的其他标签页，本页会自动继续。';if($('#reportImportStatus'))$('#reportImportStatus').textContent=message;showToast(message)};req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db)};req.onerror=()=>{dbPromise=null;reject(req.error)}});return dbPromise}
async function dbPut(store,value){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function dbSaveVoicePack(manifest,records){manifest=normalizeVoiceParameterPack(manifest);records=records.map(normalizeParameterRecord);const db=await getDb();return new Promise((resolve,reject)=>{const tx=db.transaction(['voicePacks','voiceSamples'],'readwrite'),packs=tx.objectStore('voicePacks'),samples=tx.objectStore('voiceSamples');packs.put(manifest);records.forEach(record=>samples.put(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('本机存储写入失败'));tx.onabort=()=>reject(tx.error||Error('本机存储事务已取消'))})}
async function dbDeleteVoicePack(id){const db=await getDb();return new Promise((resolve,reject)=>{const tx=db.transaction(['voicePacks','voiceSamples'],'readwrite'),packs=tx.objectStore('voicePacks'),samples=tx.objectStore('voiceSamples');packs.delete(id);const request=samples.getAll();request.onsuccess=()=>request.result.filter(record=>record.packId===id).forEach(record=>samples.delete(record.id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('本机声线删除失败'));tx.onabort=()=>reject(tx.error||Error('本机声线删除已取消'))})}
async function dbAll(store){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>{const rows=r.result||[];res(store==='voicePacks'?rows.map(normalizeVoiceParameterPack):store==='voiceSamples'?rows.map(normalizeParameterRecord):rows)};r.onerror=()=>rej(r.error)})}
async function dbDelete(store,id){const db=await getDb();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

window.__vocalLab={get audio(){return audio},get state(){return state},acousticValues,PitchCore,estimateF0,runPitchCoreTests,runPitchDetectionSelfTests};

async function init(){bindControls();bindFormantExplainer();bindPhonation();bindMobileTabs();setupVoiceLab();const pitchCoreResult=runPitchCoreTests();if(new URLSearchParams(location.search).get('test')==='pitch-core')setTimeout(()=>runPitchDetectionSelfTests(pitchCoreResult));try{voicePartOverrides=JSON.parse(localStorage.getItem('vocalLabVoiceParts')||'{}')||{}}catch(err){console.warn('Local settings unavailable.',err)}selectedReferenceId='tenor-model';await loadVoicePacks();selectAvailableVoiceVowel();Object.assign(state,vowelPreset(state.currentVowel));render();if(!personalVoicePacks.size)setAudioState('','请先创建我的声线')}
init();
