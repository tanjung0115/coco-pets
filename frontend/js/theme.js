/* Blue palette from the user's mobile reference. Original exports stay intact. */
'use strict';
window.COCO_THEME={
 primary:'#4b82b2',background:'#d0e3f4',
 colors:{
  '#5cb15a':'#4b82b2','#74bf72':'#4b82b2','#26662b':'#446d88','#327030':'#527b94',
  '#397d3b':'#567f95','#39843c':'#4b82b2','#357f48':'#4b82b2','#348037':'#567f95',
  '#eff7ee':'#e4eef6','#d1e8d1':'#dce8f2','#f7f7f7':'#d0e3f4',
  '#064e57':'#567f95','#005562':'#567f95','#141415':'#2c3c46','#1f1f20':'#2c3c46',
  '#27ae60':'#87b6a6','#e64d4d':'#c87987','#ee4b50':'#c87987'
 },
 recolor(value){return value.replace(/#[\da-f]{8}\b|#[\da-f]{6}\b/gi,color=>{
  const base=color.slice(0,7).toLowerCase(),replacement=this.colors[base];
  return replacement?replacement+color.slice(7):color;
 });}
};
