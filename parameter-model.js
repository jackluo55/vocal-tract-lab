/* Axis schema v3: larger larynxHeight = lower; larger velumOpening = raised.
 * Hz values and MRI measurements are outside this normalized teaching scale.
 */
const PARAMETER_MODEL_VERSION=3;
function parameterDirectionVersion(analysis,inherited){
  const version=analysis?.parameterModelVersion??inherited;
  if(Number.isFinite(Number(version))&&Number(version)>0)return Number(version);
  return analysis?.pitchAlgorithm==='mpm-yin-track-v9'?2:1;
}
function normalizeParameterSample(sample,vowel,inherited){
  if(!sample||typeof sample!=='object')return sample;
  const version=parameterDirectionVersion(sample,inherited);
  if(version>=PARAMETER_MODEL_VERSION)return sample;
  const next={...sample,parameterModelVersion:PARAMETER_MODEL_VERSION};
  if(sample.params){
    const original={...sample.params},params={...original};
    for(const key of ['larynxHeight','velumOpening'])if(Number.isFinite(original[key]))params[key]=clamp(100-original[key]);
    // Preview v2 had already reversed the F3 slope but retained the old baseline.
    // Rebuild that one coordinate against the new baseline, including clipping.
    if(version===2&&VOWEL_PRESETS[vowel])params.larynxHeight=usableFormants(sample)?clamp(VOWEL_PRESETS[vowel].larynxHeight-(sample.f3-VOWELS[vowel].f3)/25):VOWEL_PRESETS[vowel].larynxHeight;
    next.params=params;
    next.parameterMigration={fromVersion:version,toVersion:PARAMETER_MODEL_VERSION,originalParams:original};
  }
  return next;
}
function normalizeVoiceParameterPack(pack){
  if(!pack||typeof pack!=='object')return pack;
  const version=parameterDirectionVersion(pack.analysis,pack.parameterModelVersion);
  if(version>=PARAMETER_MODEL_VERSION)return pack;
  const analysis={...pack.analysis,parameterModelVersion:PARAMETER_MODEL_VERSION};
  if(pack.analysis?.vowels)analysis.vowels=Object.fromEntries(Object.entries(pack.analysis.vowels).map(([vowel,sample])=>[vowel,normalizeParameterSample(sample,vowel,version)]));
  const vowels=Object.fromEntries(Object.entries(pack.vowels||{}).map(([vowel,item])=>[vowel,item.analysis?{...item,analysis:normalizeParameterSample(item.analysis,vowel,version)}:item]));
  return {...pack,parameterModelVersion:PARAMETER_MODEL_VERSION,analysis,vowels};
}
function normalizeParameterRecord(record){return record?.analysis?{...record,analysis:normalizeParameterSample(record.analysis,record.vowel)}:record}
