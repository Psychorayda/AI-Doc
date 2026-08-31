/* 中文数字工具：validator（数值清洗）与 nlu（月份解析）共用
 * CN_DIGIT：单字 → 数字（含 十一/十二 月份用例）；cn2num：中文数字串 → 阿拉伯（≤999） */
export const CN_DIGIT = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12};

export function cn2num(s){
  if(!/^[零一二两三四五六七八九十百]+$/.test(s)) return NaN;
  let sec=0,num=0;
  for(const ch of s){
    if(CN_DIGIT[ch]!=null && CN_DIGIT[ch]<10) num=CN_DIGIT[ch];
    else if(ch==='十'){ sec+=(num||1)*10; num=0; }
    else if(ch==='百'){ sec+=num*100; num=0; }
  }
  return sec+num;
}
