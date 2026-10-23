/* Local preview upgrade. Audio and reference data remain in this browser. */
let pitchJobId=0;
class PitchWorkerClient{
  constructor(){
    this.pending=new Map();this.worker=null;
    try{this.worker=new Worker('./pitch-worker.js?v=20261023-release-1');this.worker.onmessage=event=>{const job=this.pending.get(event.data.id);if(!job)return;this.pending.delete(event.data.id);clearTimeout(job.timer);event.data.error?job.reject(Error(event.data.error)):job.resolve(event.data.result)};this.worker.onerror=()=>this.close('后台分析暂不可用')}catch{}
  }
  run(kind,data,sampleRate){
    if(!this.worker)return new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(kind==='analyze'?VocalPitchEngine.analyze(data,sampleRate):VocalPitchEngine.frame(data,sampleRate))}catch(error){reject(error)}},0));
    const id=++pitchJobId,copy=Float32Array.from(data);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('分析超时，请重试'))},20000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,kind,data:copy,sampleRate},[copy.buffer])});
  }
  close(message='分析已结束'){this.worker?.terminate();this.worker=null;for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error(message))}this.pending.clear()}
}
function analysisChannel(buffer){
  let best=0,bestEnergy=-1;
  for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);let energy=0;for(let i=0;i<channel.length;i++)energy+=channel[i]*channel[i];if(energy>bestEnergy){best=c;bestEnergy=energy}}
  return buffer.getChannelData(best);
}
function sampleQuality(data){let peak=0,energy=0,clippedSamples=0;for(const v of data){const a=Math.abs(v);peak=Math.max(peak,a);energy+=v*v;if(a>=.995)clippedSamples++}return {peak,rms:Math.sqrt(energy/Math.max(1,data.length)),clippedSamples}}
function estimateF0(data,sampleRate,expectedFrequency=null){return VocalPitchEngine.analyze(data,sampleRate)}
function applyHumanOctaveAssist(frequency,expectedFrequency,enabled=false){return {frequency,applied:false,cents:expectedFrequency?1200*Math.log2(frequency/expectedFrequency):0}}
function estimateResampledFormants(data,sampleRate,vowel,f0){return estimateTrustedFormants(data,sampleRate,vowel,f0)}
function estimateTrustedFormants(data,sampleRate,vowel,f0){
  const unavailable=reason=>({f1:null,f2:null,f3:null,formantQuality:'uncertain',formantMethod:reason,formantFrames:0});
  if(f0>=500)return unavailable('高音泛音稀疏，当前版本暂不提供可靠共振峰');
  if(sampleRate<12000)return unavailable('采样率不足');
  const alternatives=[];
  for(const ceiling of [4500,5000,5500]){
    const rate=ceiling*2,length=Math.round(.05*rate),order=Math.round(2+rate/1000),tracks=[],alpha=Math.exp(-2*Math.PI*50/rate);
    for(const position of [.25,.375,.5,.625,.75]){
      const sampled=lowpassFrame(data,sampleRate,rate,position,length),frame=new Float64Array(length);let prev=0;
      for(let i=0;i<length;i++){frame[i]=(sampled[i]-alpha*prev)*(.54-.46*Math.cos(2*Math.PI*i/(length-1)));prev=sampled[i]}
      try{const poles=lpcPoleFrequencies(lpcCoefficients(frame,order),rate,ceiling);if(poles.length>=3&&poles[0].frequency+80<poles[1].frequency&&poles[1].frequency+80<poles[2].frequency)tracks.push(poles.slice(0,3).map(p=>p.frequency))}catch{}
    }
    if(tracks.length<4)continue;
    const center=[0,1,2].map(k=>median(tracks.map(t=>t[k]))),spread=center.map((v,k)=>Math.sqrt(tracks.reduce((sum,t)=>sum+(t[k]-v)**2,0)/tracks.length));
    if(center[0]>1300||spread[0]>120||spread[1]>180||spread[2]>250)continue;
    alternatives.push({ceiling,center,spread,frames:tracks.length,score:spread[0]+spread[1]+spread[2]});
  }
  if(alternatives.length<2)return unavailable('多配置共振峰结果未形成一致轨迹');
  alternatives.sort((a,b)=>a.score-b.score);const best=alternatives[0],agreement=alternatives.filter(a=>a.center.every((v,k)=>Math.abs(v-best.center[k])<[120,200,280][k]));
  if(agreement.length<2)return unavailable('不同分析配置的共振峰差异较大');
  const center=[0,1,2].map(k=>median(agreement.map(a=>a.center[k])));
  return {f1:Math.round(center[0]),f2:Math.round(center[1]),f3:Math.round(center[2]),formantQuality:'stable',formantStdHz:best.spread.map(Math.round),formantFrames:best.frames,formantConfigurations:agreement.map(a=>a.ceiling),formantMethod:'多上限配置、5帧LPC一致性核验（声学估计）'};
}
function analyzeVoiceSample(buffer,vowel,expectedFrequency=recordingTargetPitch.hz,options={}){
  const data=analysisChannel(buffer),pitch=options.pitch||estimateF0(data,buffer.sampleRate),shift=Number(options.manualOctave)||0,raw=pitch.frequency,f0=raw*Math.pow(2,shift),formants=estimateResampledFormants(data,buffer.sampleRate,vowel,raw);
  return {f0:Number(f0.toFixed(2)),measuredF0:Number(f0.toFixed(2)),rawFrequency:Number(raw.toFixed(2)),correctedFrequency:Number(f0.toFixed(2)),manualOctave:shift,mcleodFrequency:Number(pitch.mcleodFrequency.toFixed(2)),yinFrequency:Number(pitch.yinFrequency.toFixed(2)),octaveCorrection:shift?'manual':'none',pitchConfidence:Number(pitch.confidence.toFixed(3)),pitchFrames:pitch.frameCount,pitchTotalFrames:pitch.totalFrames,pitchVoicedRatio:pitch.voicedRatio,pitchStdCents:Number(pitch.pitchStdCents.toFixed(1)),pitchTrace:pitch.trace,sampleRate:buffer.sampleRate,analysisSampleRate:pitch.analysisSampleRate,pitchAlgorithm:VocalPitchEngine.version,parameterModelVersion:PARAMETER_MODEL_VERSION,...formants};
}
async function analyzeVoiceSampleAsync(buffer,vowel,target,options={}){const client=new PitchWorkerClient();try{const pitch=await client.run('analyze',analysisChannel(buffer),buffer.sampleRate);return analyzeVoiceSample(buffer,vowel,target,{...options,pitch})}finally{client.close()}}
async function validateSample(vowel,file){
  const card=$(`.sample-card[data-vowel="${vowel}"]`),msg=card.querySelector('small');card.classList.remove('ready','error');if(!file)return;
  personalSamples[vowel]=null;setPreviewSample(vowel,file);persistVoiceDraft();let ctx,ownsContext=false;
  const target={...recordingTargetPitch},shift=manualOctave;
  try{
    ownsContext=!audio?.ctx;ctx=audio?.ctx||new (window.AudioContext||window.webkitAudioContext)();
    const buffer=await ctx.decodeAudioData(await file.arrayBuffer()),duration=buffer.duration,data=analysisChannel(buffer),quality=sampleQuality(data),{peak,rms}=quality;
    if(duration<2.5||duration>7)throw Error(`时长 ${duration.toFixed(1)} 秒，请保持3—6秒后重新录制`);
    if(quality.clippedSamples)throw Error('检测到削波，请降低录音音量后重新录制');
    if(rms<.015)throw Error('音量过低，请靠近麦克风重新录制');
    msg.textContent='正在分析连续发声的音高与质量…';
    const analysis=await analyzeVoiceSampleAsync(buffer,vowel,target.hz,{manualOctave:shift}),pitchCents=Math.round(1200*Math.log2(analysis.f0/target.hz)),detected=PitchCore.frequencyToPitch(analysis.f0);
    if(recordingTargetPitch.midi!==target.midi)throw Error('分析期间目标音高已改变，请重新导入本段录音');
    updatePitchDebug({rawFrequency:analysis.rawFrequency,correctedFrequency:analysis.correctedFrequency,confidence:analysis.pitchConfidence,source:`录音 [${vowel}] · ${analysis.pitchFrames}/${analysis.pitchTotalFrames} 帧`,sampleRate:analysis.sampleRate,duration,detector:'MPM + YIN 多帧独立检测'+(shift?' · 手动调整':'')});
    if(Math.abs(pitchCents)>50)throw Error(`分析为 ${detected.note}（${analysis.f0.toFixed(2)} Hz），与所选 ${target.note} 相差 ${pitchCents>0?'+':''}${pitchCents} 音分`);
    analysis.referencePitchCents=pitchCents;analysis.targetMidi=target.midi;personalSamples[vowel]={blob:file,buffer,duration,peak,rms,analysis};card.classList.add('ready');
    msg.textContent=`${duration.toFixed(1)}秒 · ${detected.note} ${analysis.f0.toFixed(2)} Hz · ${analysis.pitchFrames}个有效帧 · ${analysis.formantQuality==='stable'?'共振峰可观察':'共振峰暂不作为构型依据'}`;
  }catch(err){personalSamples[vowel]=null;card.classList.add('error');msg.textContent=`${err.message}；原录音保留，可试听或重试`}
  finally{if(ownsContext&&ctx)await ctx.close().catch(()=>{});updateVoiceSave()}
}
function startRecordingMeter(stream){
  stopRecordingMeter();const Context=window.AudioContext||window.webkitAudioContext,canvas=$('#recordingWaveform');if(!Context||!canvas)return;
  const ctx=new Context(),source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(),data=new Float32Array(8192),drawCtx=canvas.getContext('2d'),worker=new PitchWorkerClient();
  analyser.fftSize=8192;analyser.smoothingTimeConstant=0;source.connect(analyser);
  const meter={ctx,source,analyser,worker,raf:0,busy:false,lastPitchAt:0,settings:stream.getAudioTracks()[0]?.getSettings?.()||{}};recordingMeter=meter;ctx.resume().catch(()=>{});
  const draw=()=>{
    if(recordingMeter!==meter)return;analyser.getFloatTimeDomainData(data);
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    const {rms}=sampleQuality(data),level=Math.min(1,rms*5.2);drawCtx.clearRect(0,0,w,h);drawCtx.fillStyle='#07141c';drawCtx.fillRect(0,0,w,h);drawCtx.strokeStyle=recordingPhase==='recording'?'#ff647c':'#ffd166';drawCtx.lineWidth=2*dpr;drawCtx.beginPath();
    for(let i=0;i<data.length;i+=16){const x=i/(data.length-1)*w,y=h/2+data[i]*h*.42;i?drawCtx.lineTo(x,y):drawCtx.moveTo(x,y)}drawCtx.stroke();drawCtx.fillStyle='rgba(255,100,124,.25)';drawCtx.fillRect(0,h-6*dpr,w*level,6*dpr);$('#recordingLevelText').textContent=level<.07?'音量偏低':level>.82?'音量较大':'音量合适';
    const now=performance.now();if(!meter.busy&&now-meter.lastPitchAt>100){meter.busy=true;meter.lastPitchAt=now;worker.run('frame',data,ctx.sampleRate).then(result=>{if(recordingMeter===meter)renderLivePitch(result)}).catch(()=>{if(recordingMeter===meter)$('#livePitchDetail').textContent='停止录音后将继续完成分析'}).finally(()=>meter.busy=false)}
    meter.raf=requestAnimationFrame(draw);
  };meter.raf=requestAnimationFrame(draw);
}
function renderLivePitch(result){
  const value=$('#livePitchValue'),detail=$('#livePitchDetail');if(!value)return;
  if(!result){value.textContent='—';detail.textContent='等待清晰的持续发声';return}
  const frequency=result.frequency*2**manualOctave,pitch=pitchFromHz(frequency),cents=Math.round(1200*Math.log2(frequency/recordingTargetPitch.hz));value.textContent=`${pitch.note} · ${frequency.toFixed(1)} Hz`;detail.textContent=`${manualOctave?'升八度后 · ':''}距目标 ${recordingTargetPitch.note} ${cents>0?'+':''}${cents} 音分`;
}
function stopRecordingMeter(){if(!recordingMeter)return;const m=recordingMeter;recordingMeter=null;cancelAnimationFrame(m.raf);m.worker?.close();try{m.source.disconnect();m.ctx.close().catch(()=>{})}catch{}const canvas=$('#recordingWaveform');canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height)}
function parseResearchCsv(text){
  const matrix=parseCsvMatrix(text.replace(/^\uFEFF/,'')),header=matrix.shift()?.map(v=>v.toLowerCase());if(!header||['source','license','singerid','voicepart','vowel','f0'].some(k=>!header.includes(k))||new Set(header).size!==header.length)throw Error('表头须有source,license,singerId,voicePart,vowel,f0，且不可重复');
  if(!matrix.length||matrix.length>5000)throw Error('需要1—5000行数据');
  return matrix.map((fields,index)=>{
    if(fields.length!==header.length)throw Error(`第${index+2}行列数不一致`);const item=Object.fromEntries(header.map((h,i)=>[h,fields[i]])),voicePart=item.voicepart.toLowerCase(),vowel=item.vowel.toLowerCase();
    if(!item.source||!item.license||!item.singerid||!Object.hasOwn(VOICE_PARTS,voicePart)||!Object.hasOwn(VOWELS,vowel))throw Error(`第${index+2}行来源、许可、歌者、声部或元音无效`);
    const read=(key,min,max,required=false)=>{const v=item[key];if(v===undefined||v===''){if(required)throw Error(`第${index+2}行缺少${key}`);return null}if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(`第${index+2}行${key}超出范围或单位错误`);return Number(v)};
    const row={source:item.source.slice(0,300),license:item.license.slice(0,160),singerId:item.singerid.slice(0,80),voicePart,vowel,f0:read('f0',50,1600,true)};
    for(const k of ['f1','f2','f3','r1','r2','r3'])row[k]=read(k,80,6500);
    if((row.f1!==null&&row.f2!==null&&row.f2-row.f1<80)||(row.f2!==null&&row.f3!==null&&row.f3-row.f2<80))throw Error(`第${index+2}行共振峰次序错误`);
    for(const k of ['tongueheightmm','jawopeningmm','larynxpositionmm','uvulaelevationmm'])row[k]=read(k,-300,300);
    for(const k of ['institution','language','method','dynamics'])row[k]=String(item[k]||'').slice(0,200);
    return row;
  });
}
function renderResearchSummary(){
  const reference=reportReference(state.currentVowel,comparisonPitchForVowel(state.currentVowel).hz),loadButton=$('#applyTenorPreset');
  $('.parameter-comparison')?.classList.toggle('no-reference',!reference.params);
  $('#comparisonTitle').textContent=reference.kind==='none'?'参数观察':'同音高·参数对比';
  const currentAnalysis=personalVoiceAnalysis()?.vowels?.[state.currentVowel];if(currentAnalysis?.parameterSource==='neutral-teaching-anchor-no-reliable-formants')$('#comparisonDescription').textContent+=' 当前元音共振峰暂不可靠；左侧初始参数仅为教学锚点，不是本次录音测量。';
  $('.comparison-adjust-hint').textContent=reference.params?'拖动左侧蓝色条调参数；右侧为所选参考。':'拖动蓝色条调节参数，细线标记原值。';
  if(loadButton){loadButton.hidden=!reference.params;loadButton.textContent=reference.kind==='recorded'?'载入参考构型':'载入教学参数'}
  const box=$('#researchSummary');if(!box)return;box.replaceChildren();if(!selectedReferenceId.startsWith('data:')){box.hidden=true;return}box.hidden=false;
  const [id,part]=selectedReferenceId.slice(5).split(':'),dataset=researchDatasets.get(id),comparison=comparisonPitchForVowel(state.currentVowel),rows=researchRows(dataset,part,state.currentVowel,comparison.hz);
  if(!rows.length){box.hidden=true;return}
  const title=document.createElement('strong');title.textContent=`[${state.currentVowel}] · ${comparison.pitch.note}附近：${rows.length}位歌者`;box.append(title);
  const text=document.createElement('p');text.textContent=rows.length?'按同元音、±50音分选取，每位歌者最多一条。以下是可用样本的中位数。':'当前元音和音高暂无匹配数据；可切换元音、音高或参考资料。';box.append(text);
  const grid=document.createElement('dl');
  for(const [key,label,unit] of [['f0','F0','Hz'],['f1','F1','Hz'],['f2','F2','Hz'],['f3','F3','Hz'],['r1','R1','Hz'],['r2','R2','Hz'],['r3','R3','Hz'],['tongueheightmm','舌最高点','mm'],['jawopeningmm','下颌开度','mm'],['larynxpositionmm','垂直喉位','mm'],['uvulaelevationmm','悬雍垂抬升','mm']]){
    const values=rows.map(r=>r[key]).filter(v=>Number.isFinite(v));if(!values.length)continue;const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=`${median(values).toFixed(unit==='mm'?1:0)} ${unit} · n=${values.length}`;div.append(dt,dd);grid.append(div);
  }box.append(grid);
  if(dataset){const note=document.createElement('p');note.className='reference-source';const sources=[...new Set(rows.map(r=>`${r.institution?r.institution+' · ':''}${r.source} · ${r.license}`))];note.textContent=sources.length?sources.join('\n'):`${dataset.rows.length}条资料已保存在本机`;box.append(note)}
}
function applySelectedReference(){
  const comparison=comparisonPitchForVowel(state.currentVowel),reference=reportReference(state.currentVowel,comparison.hz);if(!reference.params)return;
  if(reference.kind==='model'){applyTenorPreset();return}
  clearTimeout(auditionTimer);auditionSequence++;auditionActive=false;pressing=false;locked=false;phonationRequest++;state.isPhonating=false;syncLockUi();Object.assign(state,reference.params);render();showToast(`已载入“${reference.label}”的教学映射参数`);
}
async function reanalyzeSelectedVoice(){
  const pack=personalVoicePacks.get(state.voicePackId),status=$('#reportImportStatus'),button=$('#reanalyzeVoice');if(!pack||pack.source==='bundled'){status.textContent='请选择自己保存的本机声线后重新分析。';return}button.disabled=true;const Context=window.AudioContext||window.webkitAudioContext,ctx=new Context();
  try{
    status.textContent='正在重新分析；原始结果会保留…';const oldRecords=(await dbAll('voiceSamples')).filter(r=>r.packId===pack.id),records=[],samples={};
    for(const r of oldRecords){const buffer=await ctx.decodeAudioData(await r.blob.arrayBuffer()),analysis=await analyzeVoiceSampleAsync(buffer,r.vowel,null);records.push({...r,analysis,analysisHistory:[...(r.analysisHistory||[]),r.analysis]});samples[r.vowel]={analysis}}
    if(!records.length)throw Error('未找到录音');const next={...pack,analysisHistory:[...(pack.analysisHistory||[]),pack.analysis],analysis:buildPersonalAnalysis(samples,pack.analysis?.targetPitch||recordingTargetPitch),reanalyzedAt:new Date().toISOString(),vowels:{...pack.vowels}};next.f0=next.analysis.f0;
    for(const r of records)next.vowels[r.vowel]={...next.vowels[r.vowel],analysis:r.analysis};await dbSaveVoicePack(next,records);personalVoicePacks.set(next.id,next);Object.assign(state,vowelPreset(state.currentVowel));render();status.textContent='重新分析完成，旧结果及原始录音已保留。';
  }catch(error){status.textContent=`重新分析未完成：${error.message}。原结果保持不变。`}
  finally{await ctx.close().catch(()=>{});button.disabled=false}
}
async function setupUpgrade(){
  // Octave adjustment control removed; recording analysis uses actual frequency.
  $('#openReferenceLibrary').onclick=()=>$('#referenceDialog').showModal();
  $('#referenceVoiceSelect').onchange=e=>{selectedReferenceId=e.target.value;render()};
  $('#importReferencePack').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importReferencePack(file)};
  $('#importResearchCsv').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importResearchCsv(file)};
  $('#downloadResearchTemplate').onclick=()=>{const head='source,license,singerId,voicePart,vowel,f0,f1,f2,f3,r1,r2,r3,tongueHeightMm,jawOpeningMm,larynxPositionMm,uvulaElevationMm,institution,language,method,dynamics\r\n',url=URL.createObjectURL(new Blob(['\ufeff'+head],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='声道实验台_参考资料模板.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('#reanalyzeVoice').onclick=reanalyzeSelectedVoice;
  $('#deleteResearchDataset').onclick=async()=>{if(!selectedReferenceId.startsWith('data:'))return;const id=selectedReferenceId.slice(5).split(':')[0],dataset=researchDatasets.get(id);if(!dataset||!confirm(`删除本机参考资料“${dataset.name}”？`))return;await dbDelete('referenceDatasets',id);researchDatasets.delete(id);selectedReferenceId='none';render()};
  try{for(const dataset of await dbAll('referenceDatasets'))researchDatasets.set(dataset.id,dataset);renderReferenceOptions();renderResearchSummary()}catch{}
  if(window.__vocalLab)window.__vocalLab.estimateF0=estimateF0;
}
window.addEventListener('DOMContentLoaded',setupUpgrade);
