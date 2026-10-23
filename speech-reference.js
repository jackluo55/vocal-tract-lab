/* Independent implementation of the published numerical reference in VoiceScope:
 * https://github.com/Lemelson/VoiceScope/blob/main/content.js
 * https://github.com/Lemelson/VoiceScope/blob/main/index.html
 * Normal models: male 116 +/- 16 Hz; female 190 +/- 25 Hz.
 * These are illustrative models, not population counts, diagnoses or voice types.
 * No VoiceScope implementation code or third-party runtime is bundled here. */
((root)=>{'use strict';
const limits=[80,100,132,155,185,255,Infinity];
const names=['极低','低','中低','中','中高','高','极高'];
const hints=['较少见的低位说话音高','较低说话音域','常见较低说话音域','中间说话音域','常见较高说话音域','较高说话音域','较少见的高位说话音高'];
function cdf(hz,mean,sd){const z=(hz-mean)/sd;if(!Number.isFinite(hz)||!Number.isFinite(z))throw Error('音高必须是有限数值');if(Math.abs(z)>=9)return z>0?1:0;const a=Math.abs(z),n=256,h=a/n;let area=1+Math.exp(-a*a/2);for(let i=1;i<n;i++)area+=(i%2?4:2)*Math.exp(-.5*(i*h)**2);const half=area*h/(3*Math.sqrt(2*Math.PI));return Math.max(0,Math.min(1,.5+Math.sign(z)*half))}
function describe(hz){if(!Number.isFinite(hz)||hz<=0)return null;const index=limits.findIndex(max=>hz<=max),lo=index?limits[index-1]:null,hi=limits[index],male=cdf(hz,116,16),female=cdf(hz,190,25);return {hz,index,label:names[index],hint:hints[index],range:lo===null?'低于 80 Hz':hi===Infinity?'高于 255 Hz':`${lo}–${hi} Hz`,malePercentile:Math.round(male*100),lowerThanMen:Math.round((1-male)*100),lowerThanWomen:Math.round((1-female)*100)}}
root.SpeechReference=Object.freeze({describe,cdf,bounds:Object.freeze([70,80,100,132,155,185,255,320]),model:'VoiceScope simplified F0 reference; male N(116,16²), female N(190,25²)'});
})(typeof window==='undefined'?globalThis:window);
