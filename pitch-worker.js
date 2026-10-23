importScripts('./pitch-engine.js?v=20261023-release-1');
const recent=[];
self.onmessage=event=>{
  const {id,kind,data,sampleRate}=event.data;
  try{
    let result;
    if(kind==='analyze')result=VocalPitchEngine.analyze(data,sampleRate);
    else{
      result=VocalPitchEngine.frame(data,sampleRate);
      if(!result)recent.length=0;
      else{
        recent.push(result.frequency);if(recent.length>3)recent.shift();
        const sorted=[...recent].sort((a,b)=>a-b);
        result={...result,frequency:sorted[Math.floor(sorted.length/2)]};
      }
    }
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message||'音高分析失败'})}
};
