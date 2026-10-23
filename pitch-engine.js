/* Shared browser/worker pitch engine. Target pitch never selects the answer. */
(function(root){
'use strict';
const MIN_HZ=50,MAX_HZ=1600,RATE=16000,FRAME=2048;
const median=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a.length%2?a[a.length>>1]:(a[(a.length>>1)-1]+a[a.length>>1])/2):0};
function normalizedCorrelation(frame,lag){let sum=0,first=0,second=0;for(let i=0;i<frame.length-lag;i++){const a=frame[i],b=frame[i+lag];sum+=a*b;first+=a*a;second+=b*b}return sum/Math.sqrt(first*second+1e-12)}
function spectralEnergy(frame,sampleRate,frequency){let real=0,imaginary=0;const step=2*Math.PI*frequency/sampleRate;for(let i=0;i<frame.length;i++){const phase=step*i,value=frame[i];real+=value*Math.cos(phase);imaginary-=value*Math.sin(phase)}return (real*real+imaginary*imaginary)/(frame.length*frame.length)}
function mcleodPitch(frame,sampleRate,minLag,maxLag){
  const nsdf=new Float64Array(maxLag+1);for(let lag=0;lag<=maxLag;lag++){let acf=0,energy=0;for(let i=0;i<frame.length-lag;i++){const first=frame[i],second=frame[i+lag];acf+=first*second;energy+=first*first+second*second}nsdf[lag]=energy>1e-12?2*acf/energy:0}
  const peaks=[];let position=1;while(position<=maxLag&&nsdf[position]>0)position++;position=Math.max(position,minLag);while(position<=maxLag){while(position<=maxLag&&nsdf[position]<=0)position++;if(position>maxLag)break;let peak=position;while(position<=maxLag&&nsdf[position]>0){if(nsdf[position]>nsdf[peak])peak=position;position++}if(peak>=minLag)peaks.push(peak)}if(!peaks.length)return null;
  const strongest=Math.max(...peaks.map(peak=>nsdf[peak]));if(strongest<.55)return null;const selected=peaks.find(peak=>nsdf[peak]>=strongest*.9)||peaks[0],left=nsdf[Math.max(minLag,selected-1)],center=nsdf[selected],right=nsdf[Math.min(maxLag,selected+1)],denominator=left-2*center+right,offset=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0,period=selected+offset;return {frequency:sampleRate/period,clarity:Math.max(0,Math.min(1,center))};
}
function estimateFramePitch(frame,sampleRate,minLag,maxLag,minFrequency,maxFrequency,expectedFrequency=null){
  const difference=new Float64Array(maxLag+1),normalized=new Float64Array(maxLag+1);for(let lag=1;lag<=maxLag;lag++){let sum=0;for(let i=0;i<frame.length-lag;i++){const delta=frame[i]-frame[i+lag];sum+=delta*delta}difference[lag]=sum}
  let running=0;normalized[0]=1;for(let lag=1;lag<=maxLag;lag++){running+=difference[lag];normalized[lag]=running?difference[lag]*lag/running:1}
  let rawLag=0;for(let lag=minLag;lag<maxLag;lag++){if(normalized[lag]<.16){while(lag+1<=maxLag&&normalized[lag+1]<normalized[lag])lag++;rawLag=lag;break}}
  if(!rawLag){let bestValue=1;for(let lag=minLag;lag<=maxLag;lag++)if(normalized[lag]<bestValue){bestValue=normalized[lag];rawLag=lag}if(bestValue>.32)return null}
  const left=normalized[Math.max(minLag,rawLag-1)],center=normalized[rawLag],right=normalized[Math.min(maxLag,rawLag+1)],denominator=left-2*center+right,offset=Math.abs(denominator)>1e-9?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0,yinFrequency=sampleRate/(rawLag+offset),mcleod=mcleodPitch(frame,sampleRate,minLag,maxLag),rawFrequency=mcleod?.frequency||yinFrequency,candidates=[yinFrequency/2,yinFrequency,yinFrequency*2,mcleod?.frequency/2,mcleod?.frequency,mcleod?.frequency*2].filter(frequency=>Number.isFinite(frequency)&&frequency>=minFrequency&&frequency<=maxFrequency).filter((frequency,index,all)=>all.findIndex(value=>Math.abs(1200*Math.log2(value/frequency))<8)===index);
  const details=candidates.map(frequency=>{const lag=Math.max(minLag,Math.min(maxLag,Math.round(sampleRate/frequency))),correlation=Math.max(0,normalizedCorrelation(frame,lag)),yinQuality=Math.max(0,1-normalized[lag]),energies=[];for(let harmonic=1;harmonic<=8&&frequency*harmonic<sampleRate/2;harmonic++){let energy=0;for(const scale of [.992,.996,1,1.004,1.008])energy=Math.max(energy,spectralEnergy(frame,sampleRate,frequency*harmonic*scale));energies.push(energy)}const fundamental=energies[0]||0,subharmonic=frequency/2>=minFrequency?spectralEnergy(frame,sampleRate,frequency/2):0;let harmonics=0,oddEnergy=fundamental,evenEnergy=0;for(let harmonic=2;harmonic<=energies.length;harmonic++){const weighted=energies[harmonic-1]/Math.pow(harmonic,.7);harmonics+=weighted;if(harmonic%2)oddEnergy+=weighted;else evenEnergy+=weighted}const oddEvenRatio=oddEnergy/(evenEnergy+1e-12),targetCents=expectedFrequency?Math.abs(1200*Math.log2(frequency/expectedFrequency)):Infinity,mcleodCents=mcleod?Math.abs(1200*Math.log2(frequency/mcleod.frequency)):Infinity;return {frequency,correlation,yinQuality,fundamental,subharmonic,harmonics,oddEnergy,evenEnergy,oddEvenRatio,targetCents,mcleodCents}});
  const maxFundamental=Math.max(...details.map(detail=>detail.fundamental),1e-12),maxHarmonics=Math.max(...details.map(detail=>detail.harmonics),1e-12);details.forEach(detail=>{const fundamentalSupport=detail.fundamental/maxFundamental,harmonicSupport=detail.harmonics/maxHarmonics,octavePenalty=detail.subharmonic/(detail.fundamental+detail.subharmonic+1e-12),missingOddPenalty=Math.max(0,(.12-detail.oddEvenRatio)/.12),targetTieBreaker=0,mcleodSupport=(mcleod?.clarity||0)*.24*Math.exp(-.5*Math.pow(detail.mcleodCents/35,2));detail.score=.28*detail.correlation+.22*detail.yinQuality+.17*fundamentalSupport+.11*harmonicSupport+mcleodSupport-.17*octavePenalty-.16*missingOddPenalty+targetTieBreaker;detail.confidence=Math.max(0,Math.min(1,.38*detail.correlation+.25*detail.yinQuality+.27*(mcleod?.clarity||0)+.10*Math.min(1,detail.oddEvenRatio/.2)))});
  let selected=details.reduce((best,detail)=>detail.score>best.score?detail:best),octaveCorrection='none';
  const frequency=mcleod?.clarity>.8&&Math.abs(1200*Math.log2(mcleod.frequency/selected.frequency))<15?mcleod.frequency:selected.frequency;
  return {rawFrequency,frequency,confidence:selected.confidence,score:selected.score,mcleodFrequency:mcleod?.frequency||0,yinFrequency,octaveCorrection};
}

function resample(input,sampleRate){
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('录音采样率不受支持');
 if(sampleRate===RATE)return Float32Array.from(input);
 const size=Math.floor(input.length*RATE/sampleRate),out=new Float32Array(size),cutoff=Math.min(1,RATE/sampleRate)*.92,radius=24;
 for(let j=0;j<size;j++){const p=j*sampleRate/RATE;let sum=0,total=0;for(let k=Math.ceil(p-radius);k<=Math.floor(p+radius);k++){if(k<0||k>=input.length)continue;const d=k-p,a=Math.PI*cutoff*d,w=cutoff*(Math.abs(a)<1e-10?1:Math.sin(a)/a)*(.5+.5*Math.cos(Math.PI*d/radius));sum+=input[k]*w;total+=w}out[j]=total?sum/total:0}
 return out;
}
function framePitch(input,sampleRate=RATE){
 const all=sampleRate===RATE?input:resample(input,sampleRate);
 if(all.length<FRAME)return null;
 const start=Math.floor((all.length-FRAME)/2),frame=new Float32Array(FRAME);let mean=0,energy=0;
 for(let i=0;i<FRAME;i++)mean+=all[start+i];mean/=FRAME;
 for(let i=0;i<FRAME;i++){frame[i]=all[start+i]-mean;energy+=frame[i]*frame[i]}
 const rms=Math.sqrt(energy/FRAME);if(rms<.006)return null;
 const result=estimateFramePitch(frame,RATE,Math.floor(RATE/MAX_HZ),Math.ceil(RATE/MIN_HZ),MIN_HZ,MAX_HZ);
 if(!result||result.confidence<.65||result.frequency<MIN_HZ||result.frequency>MAX_HZ)return null;
 return {...result,rms,rawFrequency:result.frequency,octaveCorrection:'none'};
}
function analyze(input,sampleRate){
 const data=resample(input,sampleRate);if(data.length<FRAME)throw Error('录音过短，无法分析');
 const count=21,frames=[],trace=[];
 for(let j=0;j<count;j++){
  const fraction=.15+.7*j/(count-1),start=Math.max(0,Math.min(data.length-FRAME,Math.floor(data.length*fraction-FRAME/2)));
  const result=framePitch(data.subarray(start,start+FRAME),RATE);
  trace.push({timeSeconds:(start+FRAME/2)/RATE,f0:result?.frequency??null,confidence:result?.confidence??0});
  if(result)frames.push(result);
 }
 if(frames.length<Math.ceil(count*.6))throw Error('有效发声不足，请保持清晰的持续元音');
 const provisional=median(frames.map(f=>f.frequency)),stable=frames.filter(f=>Math.abs(1200*Math.log2(f.frequency/provisional))<130);
 if(stable.length<Math.ceil(frames.length*.7))throw Error('录音包含多个音高，请保持同一个长音');
 const frequency=median(stable.map(f=>f.frequency)),cents=stable.map(f=>1200*Math.log2(f.frequency/frequency));
 return {frequency,rawFrequency:frequency,confidence:stable.reduce((s,f)=>s+f.confidence,0)/stable.length,frameCount:stable.length,totalFrames:count,voicedRatio:frames.length/count,pitchStdCents:Math.sqrt(cents.reduce((s,c)=>s+c*c,0)/cents.length),mcleodFrequency:median(stable.map(f=>f.mcleodFrequency)),yinFrequency:median(stable.map(f=>f.yinFrequency)),octaveCorrection:'none',trace,analysisSampleRate:RATE};
}
root.VocalPitchEngine=Object.freeze({version:'mpm-yin-track-v9',minHz:MIN_HZ,maxHz:MAX_HZ,resample,frame:framePitch,analyze});
if(typeof module!=='undefined'&&module.exports)module.exports=root.VocalPitchEngine;
})(typeof globalThis!=='undefined'?globalThis:this);
