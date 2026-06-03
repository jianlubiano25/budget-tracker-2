// ─── CONSTANTS ───────────────────────────────────────────────
const SK='ipon-v5', GK='ipon-gkey', SCHEMA_VERSION=2;
const MODELS=['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.0-flash-lite','gemini-2.0-flash','gemini-1.5-flash-8b','gemini-1.5-flash'];
const SCAN_PROMPT=`Analyze this image from the Philippines. It may be a receipt, order-details screenshot, price tag, shelf label, palengke sign, or menu.

Extract every visible purchasable line item with a Philippine Peso price. For shopping/order screenshots, match the product name on the left/center with its quantity and price on the right. If a quantity like x30 appears beside a line, return qty:30 and keep price as the visible unit price for one item. The app will compute the total as qty * price.

Return ONLY a raw JSON array, no markdown:
[{"name":"item","price":45.00,"qty":1,"unit":"kg/pcs/pack/etc","store":"infer or Unknown","category":"Food or Home","subcat":"Ulam (Viand) or Vegetables or Rice & Grains or Snacks or Drinks or Condiments & Sauces or Cleaning Supplies or Toiletries & Personal Care or Laundry or Kitchen Supplies or Medicine & First Aid or Others","note":"optional"}]

If no prices found, return: []`;
const FSRC=['Carinderia','Groceries','Palengke','Home-cooked','Grab/Delivery','Fast Food','Restaurant','Sari-sari store','Others'];
const STORES=['Palengke','Supermarket','Puregold','SM Savemore','Robinsons','Shopee/Lazada','Sari-sari','Others'];
const FCATS=['Ulam (Viand)','Vegetables','Rice & Grains','Snacks','Drinks','Condiments & Sauces','Others'];
const HCATS=['Cleaning Supplies','Toiletries & Personal Care','Laundry','Kitchen Supplies','Bedding & Linen','Medicine & First Aid','Others'];
const SCATS=['Food Staples','Cleaning','Toiletries','Medicine','Condiments','Kitchen','Others'];
const UNITS=['pcs','kg','g','pack','can','bottle','bundle','sachet','box','litre','roll','pair','tali'];
const APPLIANCE_CATS=['Cooling','Kitchen','Network','Security','Computer','Chargers','Lighting','Laundry','Others'];
const DEFAULT_AIRCON_RATES={startup:1.20,sleepDay:0.62,sleepNight:0.48,ecoDay:0.55,ecoNight:0.42,day:0.85,night:0.58};
const AIRCON_MODES=['Sleep','Eco','Normal'];
const AIRCON_MODEL_PROFILE={model:'Carrier 42CEA012308',outdoorModel:'38CEA012308',coolingKw:3.33,ratedWatts:1200,minWatts:200,maxWatts:1300,cspf:4.3,doeMonthlyKwh:162};
const DEFAULT_WEATHER={provider:'open-meteo',label:'Las Pinas, Metro Manila',lat:14.46139,lon:120.97306,elevation:10,apiKey:''};
const LABEL_DEFAULTS={foodSources:FSRC,homeCategories:HCATS,homeStores:STORES,applianceCategories:APPLIANCE_CATS};
const DEFAULT_APPLIANCES=[
  {id:'ap1',name:'Samsung Wobble Top Load 7kg',category:'Laundry',watts:500,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:45,alwaysOn:false,note:'Log per laundry session'},
  {id:'ap2',name:'Kettle Water Heater',category:'Kitchen',watts:1500,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:7,alwaysOn:false,note:'Log per coffee boil'},
  {id:'ap3',name:'PLDT Router',category:'Network',watts:12,qty:1,hoursPerDay:24,daysPerMonth:30,alwaysOn:true,note:'24/7'},
  {id:'ap4',name:'V380 CCTV + Bulb Socket',category:'Security',watts:15,qty:1,hoursPerDay:24,daysPerMonth:30,alwaysOn:true,note:'Connected like a bulb, 24/7'},
  {id:'ap5',name:'Electric Fan',category:'Cooling',watts:60,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:480,alwaysOn:false,note:'Log per use'},
  {id:'ap6',name:'Mac Charger',category:'Computer',watts:67,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:180,alwaysOn:false,note:'Log per charge'},
  {id:'ap7',name:'iPhone Charger',category:'Chargers',watts:20,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:120,alwaysOn:false,note:'Log per charge'},
  {id:'ap8',name:'iPad Charger',category:'Chargers',watts:20,qty:1,hoursPerDay:0,daysPerMonth:0,sessionMinutes:120,alwaysOn:false,note:'Log per charge'},
  {id:'ap9',name:'LED Lights',category:'Lighting',watts:9,qty:4,hoursPerDay:0,daysPerMonth:0,sessionMinutes:360,alwaysOn:false,note:'Set qty to number of bulbs; log per lights-on session'}
];
const fmt=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmt2=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt3=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:3});
const stockCatFromHome=cat=>cat==='Cleaning Supplies'?'Cleaning':cat==='Laundry'?'Cleaning':cat==='Toiletries & Personal Care'?'Toiletries':cat==='Medicine & First Aid'?'Medicine':cat==='Kitchen Supplies'?'Kitchen':'Others';
const isGroceryTx=t=>t?.source==='Groceries';
const isHomeCookedTx=t=>t?.source==='Home-cooked';
const stockFromHome=(item,id=uid())=>({id,name:item.name,category:stockCatFromHome(item.category),quantity:parseFloat(item.qty)||1,unit:item.unit||'pcs',minQty:0,note:[item.store,item.note].filter(Boolean).join(' · ')});
const groceryName=tx=>String(tx.stockName||tx.note||'Groceries').split(' · ')[0].trim()||'Groceries';
const stockCatFromFood=subcat=>subcat==='Condiments & Sauces'?'Condiments':'Food Staples';
const stockFromGrocery=(tx,id=uid())=>({id,name:groceryName(tx),category:tx.stockCategory||stockCatFromFood(tx.subcat)||'Food Staples',quantity:parseFloat(tx.qty)||1,unit:tx.unit||'pcs',minQty:0,note:'From groceries'});
const toStr=()=>dateOf(new Date());
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const resizeImage=(file,maxW=1600,maxH=1600)=>new Promise((res,rej)=>{
  const r=new FileReader();r.onload=e=>{
    const img=new Image();img.onload=()=>{
      const c=document.createElement('canvas');let w=img.width,h=img.height;
      if(w>h){if(w>maxW){h*=maxW/w;w=maxW;}}else{if(h>maxH){w*=maxH/h;h=maxH;}}
      c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
      res(c.toDataURL('image/jpeg',0.8));
    };
    img.onerror=rej;img.src=e.target.result;
  };
  r.onerror=rej;r.readAsDataURL(file);
});
const mk=d=>{const dt=d?new Date(d+'T12:00:00'):new Date();return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;};
const mklbl=k=>{const[y,m]=k.split('-');return new Date(y,m-1,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});};
const curMk=()=>mk();
const shiftMonthKey=(k,delta)=>{const[y,m]=k.split('-').map(Number),d=new Date(y,m-1+delta,1,12);return mk(dateOf(d));};
const pad2=n=>String(n).padStart(2,'0');
const dateOf=dt=>`${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
const timeOf=dt=>`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
const dtOf=d=>new Date(d+'T12:00:00');
const chartLbl=d=>`${d.getDate()} · ${d.toLocaleDateString('en-PH',{weekday:'short'})}`;
function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}
function meralcoReadDay(data=S?.data){return Math.max(1,Math.min(31,parseInt(data?.meralcoReadDay)||12));}
function cycleForDate(dateLike,readDay=meralcoReadDay()){
  const dt=dateLike instanceof Date?new Date(dateLike):dtOf(dateLike||toStr());
  const y=dt.getFullYear(),m=dt.getMonth(),day=dt.getDate();
  const thisRead=Math.min(readDay,daysInMonth(y,m));
  const end=day<=thisRead?new Date(y,m,thisRead,12):new Date(y,m+1,Math.min(readDay,daysInMonth(y,m+1)),12);
  const prevRead=Math.min(readDay,daysInMonth(end.getFullYear(),end.getMonth()-1));
  const start=new Date(end.getFullYear(),end.getMonth()-1,prevRead+1,12);
  return{key:dateOf(end),start,end,readDay};
}
function shiftCycleKey(cycleKey,delta,readDay=meralcoReadDay()){
  const base=dtOf(cycleKey||toStr());
  base.setMonth(base.getMonth()+delta);
  const last=daysInMonth(base.getFullYear(),base.getMonth());
  base.setDate(Math.min(readDay,last));
  return cycleForDate(base,readDay).key;
}
function cycleLabel(c){
  const sameYear=c.start.getFullYear()===c.end.getFullYear();
  const optsStart={month:'short',day:'numeric',...(sameYear?{}:{year:'numeric'})};
  return `${c.start.toLocaleDateString('en-PH',optsStart)}-${c.end.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}`;
}
function inCycle(item,cycle){const dt=dtOf(item.date);return dt>=cycle.start&&dt<=cycle.end;}
function cycleDays(c){return Math.round((c.end-c.start)/86400000)+1;}
function time12Parts(t){
  const m=minsOfDay(t);if(isNaN(m))return{h:'12',mi:'00',ap:'AM'};
  const h24=Math.floor(m/60),mi=pad2(m%60),ap=h24>=12?'PM':'AM';
  const h12=h24%12||12;return{h:String(h12),mi,ap};
}
function time12To24(h,mi,ap){let hh=parseInt(h)||12;hh=Math.max(1,Math.min(12,hh));let h24=hh%12;if(ap==='PM')h24+=12;return `${pad2(h24)}:${pad2(parseInt(mi)||0)}`;}
function fmtTime12(t){
  const p=time12Parts(t);
  return `${p.h}:${p.mi} ${p.ap}`;
}
function minsOfDay(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return NaN;const h=+m[1],mi=+m[2];return h>=0&&h<24&&mi>=0&&mi<60?h*60+mi:NaN;}
function timePlus(t,minutes){const sm=minsOfDay(t);if(isNaN(sm))return '';const m=((sm+Math.round(minutes))%1440+1440)%1440;return `${pad2(Math.floor(m/60))}:${pad2(m%60)}`;}
function minutesBetween(start,end){const sm=minsOfDay(start),em=minsOfDay(end);if(isNaN(sm)||isNaN(em))return 0;let mins=em-sm;if(mins<=0)mins+=1440;return mins;}
function durationLabel(minutes){
  const mins=Math.max(0,Math.round(parseFloat(minutes)||0)),h=Math.floor(mins/60),m=mins%60;
  if(h&&m)return `${h}h ${m}m`;
  if(h)return `${h}h`;
  return `${m}m`;
}
function isDayMinute(min){const m=((min%1440)+1440)%1440;return m>=360&&m<1080;}
function airconRates(data){
  const d=data||S?.data||{};
  return{
    startup:parseFloat(d.airconStartupRate)||DEFAULT_AIRCON_RATES.startup,
    sleepDay:parseFloat(d.airconSleepDayRate)||DEFAULT_AIRCON_RATES.sleepDay,
    sleepNight:parseFloat(d.airconSleepNightRate)||DEFAULT_AIRCON_RATES.sleepNight,
    ecoDay:parseFloat(d.airconEcoDayRate)||DEFAULT_AIRCON_RATES.ecoDay,
    ecoNight:parseFloat(d.airconEcoNightRate)||DEFAULT_AIRCON_RATES.ecoNight,
    day:parseFloat(d.airconDayRate)||DEFAULT_AIRCON_RATES.day,
    night:parseFloat(d.airconNightRate)||DEFAULT_AIRCON_RATES.night
  };
}
function airconModeFrom(value,sleepMode){
  const raw=String(value||'').toLowerCase();
  if(raw==='eco'||raw==='normal'||raw==='sleep')return raw;
  return sleepMode===false?'normal':'sleep';
}
function airconModeLabel(value,sleepMode){
  const mode=airconModeFrom(value,sleepMode);
  return mode==='eco'?'Eco':mode==='normal'?'Normal':'Sleep';
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function numIn(v,fallback,min,max){const n=parseFloat(v);return isNaN(n)?fallback:clamp(n,min,max);}
function airconTempFactor(tempC,data=S?.data){
  const temp=parseFloat(tempC),baseline=parseFloat(data?.airconTempBaseline)||29,step=(parseFloat(data?.airconTempStepPct)||7)/100;
  if(isNaN(temp))return 1;
  return clamp(1+(baseline-temp)*step,0.75,1.35);
}
function airconOutdoorFactor(outdoorTemp,data=S?.data){
  const temp=parseFloat(outdoorTemp),baseline=parseFloat(data?.airconOutdoorBaseline)||30,step=(parseFloat(data?.airconOutdoorStepPct)||2.5)/100;
  if(isNaN(temp))return 1;
  return clamp(1+(temp-baseline)*step,0.85,1.25);
}
function airconRateForMinute(min,mode='sleep',rates=airconRates(),tempC='',outdoorTemp='',data=S?.data){
  const day=isDayMinute(min),m=airconModeFrom(mode);
  const base=m==='eco'?(day?rates.ecoDay:rates.ecoNight):m==='normal'?(day?rates.day:rates.night):(day?rates.sleepDay:rates.sleepNight);
  return base*airconTempFactor(tempC,data)*airconOutdoorFactor(outdoorTemp,data);
}
function airconSessionFromMinutes(startMin,totalMinutes,mode='sleep',date,start,end,rates=airconRates(),tempC='',outdoorTemp='',data=S?.data){
  const mins=Math.max(1,Math.round(totalMinutes));
  let kwh=0;
  const useMode=airconModeFrom(mode);
  for(let i=0;i<mins;i++){
    const runRate=airconRateForMinute(startMin+i,useMode,rates,tempC,outdoorTemp,data);
    const phaseRate=i<15?rates.startup:i<60?(rates.startup*(1-(i-15)/45)+runRate*((i-15)/45)):runRate;
    kwh+=phaseRate/60;
  }
  return{date,start,end,mode:useMode,sleepMode:useMode==='sleep',minutes:mins,hours:mins/60,kwh};
}
function airconSessionFromParts(date,start,end,mode='sleep',rates=airconRates(),tempC='',outdoorTemp='',data=S?.data){
  const sm=minsOfDay(start),em=minsOfDay(end);if(isNaN(sm)||isNaN(em))return null;
  let total=em-sm;if(total<=0)total+=1440;
  return airconSessionFromMinutes(sm,total,mode,date,start,end,rates,tempC,outdoorTemp,data);
}
function airconSessionFromDates(startDt,endDt,mode='sleep',rates=airconRates(),tempC='',outdoorTemp='',data=S?.data){
  const mins=Math.max(1,Math.round((endDt-startDt)/60000));
  let kwh=0;
  const useMode=airconModeFrom(mode);
  for(let i=0;i<mins;i++){
    const dt=new Date(startDt.getTime()+i*60000),runRate=airconRateForMinute(dt.getHours()*60+dt.getMinutes(),useMode,rates,tempC,outdoorTemp,data);
    const phaseRate=i<15?rates.startup:i<60?(rates.startup*(1-(i-15)/45)+runRate*((i-15)/45)):runRate;
    kwh+=phaseRate/60;
  }
  return{date:dateOf(startDt),start:timeOf(startDt),end:timeOf(endDt),mode:useMode,sleepMode:useMode==='sleep',minutes:mins,hours:mins/60,kwh};
}
function applianceMonthly(a,rate=S?.data?.meralcoRate||14.3345){
  const watts=parseFloat(a.watts)||0,qty=parseFloat(a.qty)||1;
  const hours=a.alwaysOn?24:0;
  const days=a.alwaysOn?30:0;
  const kwh=(watts*qty*hours*days)/1000;
  return{watts,qty,hours,days,kwh,cost:kwh*rate};
}
function applianceLabel(a){
  const e=applianceMonthly(a);
  const mins=parseFloat(a.sessionMinutes)||Math.round((parseFloat(a.hoursPerDay)||1)*60)||60;
  return `${e.qty}x · ${e.watts}W · ${a.alwaysOn?'24/7':`${durationLabel(mins)}/session`}`;
}
function applianceSessionEstimate(appliance,minutes,rate=S?.data?.meralcoRate||14.3345){
  const watts=parseFloat(appliance?.watts)||0,qty=parseFloat(appliance?.qty)||1,mins=parseFloat(minutes)||0;
  const kwh=watts*qty*(mins/60)/1000;
  return{kwh,cost:kwh*rate};
}
function auditDateTime(date,time,endOfDay=false){
  if(!date)return null;
  const t=time|| (endOfDay?'23:59':'00:00');
  const dt=new Date(`${date}T${t}:00`);
  return isNaN(dt)?null:dt;
}
function usageDateRange(u,start,end){
  const hasTime=u.start&&u.end;
  if(hasTime){
    const s=auditDateTime(u.date,u.start),e=auditDateTime(u.date,u.end);
    if(!s||!e)return null;
    if(e<=s)e.setDate(e.getDate()+1);
    return{s,e,exact:true};
  }
  const s=auditDateTime(u.date,'00:00'),e=auditDateTime(u.date,'23:59');
  return s&&e?{s,e,exact:false}:null;
}
function overlapsRange(s,e,start,end){return s<end&&e>start;}
function meterAudit(data=S?.data,f=S?.auditF){
  const start=auditDateTime(f?.startDate,f?.startTime),end=auditDateTime(f?.endDate,f?.endTime);
  const startRead=parseFloat(f?.startRead),endRead=parseFloat(f?.endRead),rate=parseFloat(data?.meralcoRate)||14.3345;
  if(!start||!end||end<=start)return{valid:false,error:'Enter a valid start and end time.'};
  const meterKwh=!isNaN(startRead)&&!isNaN(endRead)?endRead-startRead:0;
  const hours=(end-start)/36e5;
  const include=(u)=>{const r=usageDateRange(u,start,end);return r&&overlapsRange(r.s,r.e,start,end);};
  const aircon=(data?.airconUsage||[]).filter(include);
  const tv=(data?.tvUsage||[]).filter(include);
  const appliances=(data?.applianceUsage||[]).filter(include);
  const sum=rows=>rows.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0);
  const airconKwh=sum(aircon),tvKwh=sum(tv),sessionKwh=sum(appliances);
  const alwaysRows=(data?.appliances||[]).filter(a=>a.alwaysOn).map(a=>{
    const watts=parseFloat(a.watts)||0,qty=parseFloat(a.qty)||1,kwh=watts*qty*hours/1000;
    return{...a,kwh,cost:kwh*rate};
  });
  const alwaysKwh=alwaysRows.reduce((s,a)=>s+a.kwh,0);
  const loggedKwh=airconKwh+tvKwh+sessionKwh,estimatedKwh=loggedKwh+alwaysKwh;
  const gap=meterKwh?meterKwh-estimatedKwh:0;
  const matchPct=meterKwh>0?estimatedKwh/meterKwh*100:0;
  return{valid:true,start,end,hours,meterKwh,aircon,tv,appliances,alwaysRows,airconKwh,tvKwh,sessionKwh,alwaysKwh,loggedKwh,estimatedKwh,gap,matchPct,rate};
}
function applianceSessionDraft(appliance,date=toStr()){
  const mins=parseFloat(appliance?.sessionMinutes)||60,start=timeOf(new Date());
  return{applianceId:appliance?.id||'',date,start,end:timePlus(start,mins),minutes:String(mins)};
}
function timedSessionDraft(form={},fallbackMinutes=60){
  const start=timeOf(new Date()),mins=minutesBetween(form.start,form.end)||fallbackMinutes;
  return{...form,date:toStr(),start,end:timePlus(start,mins)};
}
function activeElapsedMinutes(s,now=new Date()){return Math.max(1,Math.round((now-new Date(s.startedAt))/60000));}
function activeEstimate(s,now=new Date(),data=S?.data){
  const mins=activeElapsedMinutes(s,now);
  if(s.type==='aircon'){
    const session=airconSessionFromDates(new Date(s.startedAt),now,airconModeFrom(s.mode,s.sleepMode),airconRates(data),s.tempC,s.outdoorTemp,data);
    return{minutes:mins,kwh:session.kwh,cost:session.kwh*(data?.meralcoRate||14.3345)};
  }
  const watts=parseFloat(s.watts)||0,qty=parseFloat(s.qty)||1,kwh=watts*qty*(mins/60)/1000;
  return{minutes:mins,kwh,cost:kwh*(data?.meralcoRate||14.3345)};
}
function electricityBill(data=S?.data){return (data?.bills||[]).find(b=>String(b.name||'').toLowerCase().includes('electric'));}
function billMonthFromCycle(cycle){return mk(cycle.key);}
function billCycleForMonth(monthKey,readDay=meralcoReadDay()){
  const[y,m]=monthKey.split('-').map(Number),last=daysInMonth(y,m-1);
  return cycleForDate(`${monthKey}-${pad2(Math.min(readDay,last))}`,readDay);
}
function meralcoKwhForCycle(cycle,data=S?.data){
  const bill=electricityBill(data);
  return parseFloat(bill?.monthlyKwh?.[billMonthFromCycle(cycle)])||0;
}
function electricityCycleEstimate(cycle,data=S?.data){
  const aircon=(data?.airconUsage||[]).filter(u=>inCycle(u,cycle));
  const tv=(data?.tvUsage||[]).filter(u=>inCycle(u,cycle));
  const applianceSessions=(data?.applianceUsage||[]).filter(u=>inCycle(u,cycle));
  const airconKwh=aircon.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0);
  const tvKwh=tv.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0);
  const sessionKwh=applianceSessions.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0);
  const alwaysKwh=(data?.appliances||[]).reduce((s,a)=>s+applianceMonthly(a,data?.meralcoRate||14.3345).kwh,0)/30*cycleDays(cycle);
  const totalKwh=airconKwh+tvKwh+sessionKwh+alwaysKwh;
  return{airconKwh,tvKwh,sessionKwh,alwaysKwh,totalKwh,logs:aircon.length+tv.length+applianceSessions.length};
}
function electricityDailyChart(cycle,data=S?.data,range='cycle'){
  const usage=data?.airconUsage||[],tvUsage=data?.tvUsage||[],applianceUsage=data?.applianceUsage||[];
  const alwaysOn=data?.appliances||[],dailyAlwaysOnCost=alwaysOn.reduce((s,a)=>s+applianceMonthly(a,data?.meralcoRate||14.3345).cost,0)/30;
  const dailyAlwaysOnKwh=alwaysOn.reduce((s,a)=>s+applianceMonthly(a,data?.meralcoRate||14.3345).kwh,0)/30;
  const meralcoKwh=meralcoKwhForCycle(cycle,data),meralcoDailyKwh=meralcoKwh?meralcoKwh/cycleDays(cycle):0;
  let days=[];
  if(range==='7'){
    days=Array.from({length:7},(_,i)=>{const dd=new Date();dd.setDate(dd.getDate()-(6-i));return dd;});
  }else{
    for(let dd=new Date(cycle.start);dd<=cycle.end;dd.setDate(dd.getDate()+1))days.push(new Date(dd));
  }
  return days.map(dd=>{
    const ds=dateOf(dd),air=usage.filter(u=>u.date===ds),tv=tvUsage.filter(u=>u.date===ds),ap=applianceUsage.filter(u=>u.date===ds);
    const airCost=air.reduce((s,u)=>s+u.cost,0),tvCost=tv.reduce((s,u)=>s+u.cost,0),apCost=ap.reduce((s,u)=>s+u.cost,0);
    const airKwh=air.reduce((s,u)=>s+u.kwh,0),tvKwh=tv.reduce((s,u)=>s+u.kwh,0),apKwh=ap.reduce((s,u)=>s+u.kwh,0);
    const estKwh=airKwh+tvKwh+apKwh+dailyAlwaysOnKwh;
    return{label:range==='7'?chartLbl(dd):String(dd.getDate()),ds,cost:airCost+tvCost+apCost+dailyAlwaysOnCost,kwh:meralcoDailyKwh||estKwh,estimatedKwh:estKwh,meralcoDailyKwh,airCost,tvCost,applianceCost:apCost+dailyAlwaysOnCost,airKwh,tvKwh,applianceKwh:apKwh+dailyAlwaysOnKwh};
  });
}
function mealsDailyChart(monthKey=curMk(),data=S?.data){
  const [y,m]=monthKey.split('-').map(Number),days=daysInMonth(y,m-1),meals=(data?.transactions||[]).filter(t=>!isGroceryTx(t));
  return Array.from({length:days},(_,i)=>{
    const dd=new Date(y,m-1,i+1,12),ds=dateOf(dd),items=meals.filter(t=>t.date===ds),spend=items.reduce((s,t)=>s+t.amount,0);
    return{ds,date:dd,label:String(i+1),items,count:items.length,spend,over:spend>(data?.dailyBudget||0)&&spend>0};
  });
}
function electricityComparisonForMonth(monthKey,data=S?.data,actualKwh=0){
  const cycle=billCycleForMonth(monthKey,meralcoReadDay(data));
  const est=electricityCycleEstimate(cycle,data);
  const loggedKwh=est.airconKwh+est.tvKwh+est.sessionKwh;
  return{cycle,est,loggedKwh,diff:actualKwh?Math.abs(est.totalKwh-actualKwh):0};
}
function electricityReportForMonth(monthKey=curMk(),data=S?.data){
  const rate=parseFloat(data?.meralcoRate)||14.3345,cycle=billCycleForMonth(monthKey,meralcoReadDay(data)),cycleDayCount=cycleDays(cycle);
  const aircon=(data?.airconUsage||[]).filter(u=>inCycle(u,cycle));
  const tv=(data?.tvUsage||[]).filter(u=>inCycle(u,cycle));
  const sessions=(data?.applianceUsage||[]).filter(u=>inCycle(u,cycle));
  const always=(data?.appliances||[]).filter(a=>a.alwaysOn).map(a=>{
    const est=applianceMonthly(a,rate);
    return{name:a.name,category:a.category||'24/7',kwh:est.kwh/30*cycleDayCount,cost:est.cost/30*cycleDayCount,hours:cycleDayCount*24,logs:0,type:'24/7'};
  });
  const airconKwh=aircon.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0),airconCost=aircon.reduce((s,u)=>s+(parseFloat(u.cost)||0),0),airconHours=aircon.reduce((s,u)=>s+(parseFloat(u.hours)||parseFloat(u.minutes)/60||0),0);
  const tvKwh=tv.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0),tvCost=tv.reduce((s,u)=>s+(parseFloat(u.cost)||0),0),tvHours=tv.reduce((s,u)=>s+(parseFloat(u.hours)||parseFloat(u.minutes)/60||0),0);
  const sessionKwh=sessions.reduce((s,u)=>s+(parseFloat(u.kwh)||0),0),sessionCost=sessions.reduce((s,u)=>s+(parseFloat(u.cost)||0),0),sessionHours=sessions.reduce((s,u)=>s+(parseFloat(u.hours)||parseFloat(u.minutes)/60||0),0);
  const alwaysKwh=always.reduce((s,u)=>s+u.kwh,0),alwaysCost=always.reduce((s,u)=>s+u.cost,0);
  const applianceGroups=new Map();
  sessions.forEach(u=>{
    const key=u.name||'Appliance',g=applianceGroups.get(key)||{name:key,category:u.category||'Appliance',kwh:0,cost:0,hours:0,logs:0,type:'Appliance'};
    g.kwh+=parseFloat(u.kwh)||0;g.cost+=parseFloat(u.cost)||0;g.hours+=parseFloat(u.hours)||parseFloat(u.minutes)/60||0;g.logs+=1;applianceGroups.set(key,g);
  });
  const top=[
    ...(airconKwh?[{name:'Aircon',category:'Cooling',kwh:airconKwh,cost:airconCost,hours:airconHours,logs:aircon.length,type:'Aircon'}]:[]),
    ...(tvKwh?[{name:'TV',category:'TV',kwh:tvKwh,cost:tvCost,hours:tvHours,logs:tv.length,type:'TV'}]:[]),
    ...always,
    ...applianceGroups.values()
  ].sort((a,b)=>b.kwh-a.kwh);
  const logs=[
    ...aircon.map(u=>({type:'Aircon',name:`${airconModeLabel(u.mode,u.sleepMode)} · ${durationLabel(u.minutes||(u.hours||0)*60)}`,date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'',kwh:u.kwh,cost:u.cost})),
    ...tv.map(u=>({type:'TV',name:durationLabel(u.minutes||(u.hours||0)*60),date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'',kwh:u.kwh,cost:u.cost})),
    ...sessions.map(u=>({type:'Appliance',name:`${u.name} · ${durationLabel(u.minutes)}`,date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'',kwh:u.kwh,cost:u.cost}))
  ].sort((a,b)=>b.date.localeCompare(a.date)||String(b.time).localeCompare(String(a.time)));
  const totalKwh=airconKwh+tvKwh+sessionKwh+alwaysKwh,totalCost=airconCost+tvCost+sessionCost+alwaysCost;
  return{monthKey,cycle,days:cycleDayCount,aircon,tv,sessions,always,logs,top,airconKwh,airconCost,airconHours,tvKwh,tvCost,tvHours,sessionKwh,sessionCost,sessionHours,alwaysKwh,alwaysCost,totalKwh,totalCost,rate};
}
function weatherSettings(data=S?.data){
  return{
    provider:data?.weatherProvider||DEFAULT_WEATHER.provider,
    label:data?.weatherLabel||DEFAULT_WEATHER.label,
    lat:parseFloat(data?.weatherLat)||DEFAULT_WEATHER.lat,
    lon:parseFloat(data?.weatherLon)||DEFAULT_WEATHER.lon,
    elevation:parseFloat(data?.weatherElevation)||DEFAULT_WEATHER.elevation,
    apiKey:data?.weatherApiKey||''
  };
}
function weatherSummary(w=S?.data?.weather){
  if(!w)return 'Weather not loaded';
  const parts=[];
  const codeLabel=weatherCodeLabel(w.code);
  if(w.temp!=null)parts.push(`Outdoor ${Number(w.temp).toFixed(1)}C`);
  if(codeLabel)parts.push(codeLabel);
  if(w.apparent!=null)parts.push(`Feels ${Number(w.apparent).toFixed(1)}C`);
  if(w.humidity!=null)parts.push(`Humidity ${Math.round(w.humidity)}%`);
  if(w.time)parts.push(`Updated ${fmtTime12(String(w.time).slice(11,16))}`);
  return parts.join(' · ')||'Weather not loaded';
}
function weatherCodeLabel(code){
  const c=Number(code);
  if(c===0)return 'Clear';
  if([1,2,3].includes(c))return ['Mainly clear','Partly cloudy','Overcast'][c-1];
  if([45,48].includes(c))return 'Fog';
  if([51,53,55].includes(c))return 'Drizzle';
  if([56,57].includes(c))return 'Freezing drizzle';
  if([61,63,65].includes(c))return 'Rain';
  if([66,67].includes(c))return 'Freezing rain';
  if([71,73,75,77].includes(c))return 'Snow';
  if([80,81,82].includes(c))return 'Rain showers';
  if([85,86].includes(c))return 'Snow showers';
  if([95,96,99].includes(c))return 'Thunderstorm';
  return '';
}
function weatherVisualType(code){
  const c=Number(code);
  if([45,48].includes(c))return 'fog';
  if([95,96,99].includes(c))return 'storm';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c))return 'rain';
  if([71,73,75,77,85,86].includes(c))return 'snow';
  if([1,2,3].includes(c))return 'cloud';
  return 'clear';
}
function weatherVisual(w){
  const wrap=D(`wv ${weatherVisualType(w?.code)}`);
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML='<div class="wv-glow"></div><div class="wv-sun"><span></span></div><div class="wv-cloud wv-cloud-a"></div><div class="wv-cloud wv-cloud-b"></div><div class="wv-rain wv-rain-a"></div><div class="wv-rain wv-rain-b"></div><div class="wv-rain wv-rain-c"></div><div class="wv-rain wv-rain-d"></div><div class="wv-bolt"></div><div class="wv-fog wv-fog-a"></div><div class="wv-fog wv-fog-b"></div><div class="wv-fog wv-fog-c"></div>';
  return wrap;
}
function renderWeatherCard(data=S.data,{title='Weather'}={}){
  const w=data.weather,ws=weatherSettings(data);
  const card=D('card weather-card'),body=D('cp weather-body'),copy=D('weather-copy'),art=D('weather-art');
  copy.appendChild(h('div',{cls:'lbl'},`${title} · ${ws.label}`));
  copy.appendChild(h('div',{cls:'sf weather-temp'},w?.temp!=null?`${Number(w.temp).toFixed(1)}C`:'--'));
  copy.appendChild(h('div',{cls:'weather-meta'},`${w?weatherSummary(w):(S.weatherLoading?'Loading Open-Meteo...':'Open-Meteo not loaded yet')}${S.weatherErr?' · '+S.weatherErr:''}`));
  art.appendChild(weatherVisual(w));
  art.appendChild(Btn('bgsm weather-refresh','Refresh',()=>updateWeather(true)));
  body.appendChild(art);body.appendChild(copy);card.appendChild(body);
  return card;
}
function weatherStale(data=S?.data){
  const t=Date.parse(data?.weather?.fetchedAt||'');
  return !t||Date.now()-t>15*60*1000;
}
function labelList(key,data=S?.data){
  const custom=data?.labels?.[key];
  return Array.isArray(custom)&&custom.length?custom:LABEL_DEFAULTS[key]||[];
}
const foodSources=(data=S?.data)=>labelList('foodSources',data);
const homeCategories=(data=S?.data)=>labelList('homeCategories',data);
const homeStores=(data=S?.data)=>labelList('homeStores',data);
const applianceCategories=(data=S?.data)=>labelList('applianceCategories',data);
const parseLabels=v=>[...new Set(String(v||'').split('\n').map(x=>x.trim()).filter(Boolean))];
const INIT={schemaVersion:SCHEMA_VERSION,balance:130000,transactions:[],homeExpenses:[],priceItems:[],stocks:[],bills:[{id:'b1',name:'Electricity',monthlyAmounts:{},monthlyKwh:{},paid:{}},{id:'b2',name:'WiFi / Internet',monthlyAmounts:{},paid:{}}],dailyBudget:380,groceryBudget:5000,
  airconUsage:[],tvUsage:[],meralcoRate:14.3345,airconStartupKwh:1.2,airconRunningKwh:0.6,
  airconStartupRate:1.20,airconSleepDayRate:0.62,airconSleepNightRate:0.48,airconEcoDayRate:0.55,airconEcoNightRate:0.42,airconDayRate:0.85,airconNightRate:0.58,airconDefaultSleepMode:true,airconDefaultMode:'sleep',airconDefaultTemp:'29',
  airconModel:AIRCON_MODEL_PROFILE.model,airconTempBaseline:29,airconTempStepPct:7,airconOutdoorBaseline:30,airconOutdoorStepPct:2.5,
  airconOutdoorModel:AIRCON_MODEL_PROFILE.outdoorModel,airconCoolingKw:AIRCON_MODEL_PROFILE.coolingKw,airconRatedWatts:AIRCON_MODEL_PROFILE.ratedWatts,airconMinWatts:AIRCON_MODEL_PROFILE.minWatts,airconMaxWatts:AIRCON_MODEL_PROFILE.maxWatts,airconCspf:AIRCON_MODEL_PROFILE.cspf,airconDoeMonthlyKwh:AIRCON_MODEL_PROFILE.doeMonthlyKwh,
  weatherProvider:DEFAULT_WEATHER.provider,weatherLabel:DEFAULT_WEATHER.label,weatherLat:DEFAULT_WEATHER.lat,weatherLon:DEFAULT_WEATHER.lon,weatherElevation:DEFAULT_WEATHER.elevation,weatherApiKey:'',weather:null,
  labels:LABEL_DEFAULTS,
  tvWatts:175,meralcoReadDay:12,appliances:DEFAULT_APPLIANCES,applianceUsage:[],activeSessions:[]};
function ld(){try{const s=localStorage.getItem(SK);if(s){const d=JSON.parse(s);if(!d.stocks)d.stocks=[];if(!d.homeExpenses)d.homeExpenses=[];
  d.schemaVersion=SCHEMA_VERSION;
  if(!d.groceryBudget)d.groceryBudget=5000;
  if(!d.labels)d.labels=JSON.parse(JSON.stringify(LABEL_DEFAULTS));
  Object.keys(LABEL_DEFAULTS).forEach(k=>{if(!Array.isArray(d.labels[k])||!d.labels[k].length)d.labels[k]=LABEL_DEFAULTS[k];});
  if((d.labels.foodSources||[]).includes('Palengke/Home-cooked')){
    d.labels.foodSources=(d.labels.foodSources||[]).flatMap(x=>x==='Palengke/Home-cooked'?['Palengke','Home-cooked']:[x]);
  }
  if(!d.bills)d.bills=JSON.parse(JSON.stringify(INIT.bills));d.bills=(d.bills||[]).map(b=>({...b,monthlyAmounts:b.monthlyAmounts||{},paid:b.paid||{},...(String(b.name||'').toLowerCase().includes('electric')?{monthlyKwh:b.monthlyKwh||{}}:{})}));
  if(!d.airconUsage)d.airconUsage=[];if(!d.tvUsage)d.tvUsage=[];if(!d.meralcoRate||d.meralcoRate===12.03)d.meralcoRate=14.3345;
  if(!d.meralcoReadDay)d.meralcoReadDay=12;
  if(!d.applianceUsage)d.applianceUsage=[];
  if(!d.activeSessions)d.activeSessions=[];
  if(!d.appliances)d.appliances=JSON.parse(JSON.stringify(DEFAULT_APPLIANCES));
  d.appliances=(d.appliances||[]).map(a=>({...a,qty:parseFloat(a.qty)||1,sessionMinutes:a.alwaysOn?0:(parseFloat(a.sessionMinutes)||Math.max(1,Math.round((parseFloat(a.hoursPerDay)||1)*60)))}));
  if(!d.airTimer)d.airTimer=null;
  if(!d.airconStartupKwh)d.airconStartupKwh=1.2;if(!d.airconRunningKwh)d.airconRunningKwh=0.6;if(!d.tvWatts||d.tvWatts===100)d.tvWatts=175;
  if(!d.airconStartupRate||d.airconStartupRate===0.75)d.airconStartupRate=DEFAULT_AIRCON_RATES.startup;
  if(!d.airconSleepDayRate||d.airconSleepDayRate===0.30||d.airconSleepDayRate===0.60)d.airconSleepDayRate=DEFAULT_AIRCON_RATES.sleepDay;
  if(!d.airconSleepNightRate||d.airconSleepNightRate===0.22||d.airconSleepNightRate===0.42)d.airconSleepNightRate=DEFAULT_AIRCON_RATES.sleepNight;
  if(!d.airconEcoDayRate||d.airconEcoDayRate===0.52)d.airconEcoDayRate=DEFAULT_AIRCON_RATES.ecoDay;
  if(!d.airconEcoNightRate||d.airconEcoNightRate===0.36)d.airconEcoNightRate=DEFAULT_AIRCON_RATES.ecoNight;
  if(!d.airconDayRate||d.airconDayRate===0.75)d.airconDayRate=DEFAULT_AIRCON_RATES.day;
  if(!d.airconNightRate||d.airconNightRate===0.36||d.airconNightRate===0.55)d.airconNightRate=DEFAULT_AIRCON_RATES.night;
  if(!d.airconModel)d.airconModel=AIRCON_MODEL_PROFILE.model;if(!d.airconTempBaseline)d.airconTempBaseline=29;if(!d.airconTempStepPct)d.airconTempStepPct=7;if(!d.airconOutdoorBaseline)d.airconOutdoorBaseline=30;if(!d.airconOutdoorStepPct)d.airconOutdoorStepPct=2.5;
  if(!d.airconOutdoorModel)d.airconOutdoorModel=AIRCON_MODEL_PROFILE.outdoorModel;if(!d.airconCoolingKw)d.airconCoolingKw=AIRCON_MODEL_PROFILE.coolingKw;if(!d.airconRatedWatts)d.airconRatedWatts=AIRCON_MODEL_PROFILE.ratedWatts;if(!d.airconMinWatts)d.airconMinWatts=AIRCON_MODEL_PROFILE.minWatts;if(!d.airconMaxWatts)d.airconMaxWatts=AIRCON_MODEL_PROFILE.maxWatts;if(!d.airconCspf)d.airconCspf=AIRCON_MODEL_PROFILE.cspf;if(!d.airconDoeMonthlyKwh)d.airconDoeMonthlyKwh=AIRCON_MODEL_PROFILE.doeMonthlyKwh;
  if(!d.weatherProvider)d.weatherProvider=DEFAULT_WEATHER.provider;if(!d.weatherLabel)d.weatherLabel=DEFAULT_WEATHER.label;if(!d.weatherLat)d.weatherLat=DEFAULT_WEATHER.lat;if(!d.weatherLon)d.weatherLon=DEFAULT_WEATHER.lon;if(!d.weatherElevation)d.weatherElevation=DEFAULT_WEATHER.elevation;
  if(d.airconDefaultSleepMode===undefined)d.airconDefaultSleepMode=true;if(!d.airconDefaultMode)d.airconDefaultMode=d.airconDefaultSleepMode===false?'normal':'sleep';if(d.airconDefaultTemp===undefined)d.airconDefaultTemp='29';
  return d;}}catch{}return JSON.parse(JSON.stringify(INIT));}
function sd(d){try{localStorage.setItem(SK,JSON.stringify(d));}catch{}}
function lk(){return localStorage.getItem(GK)||'';}
function sk(k){k?localStorage.setItem(GK,k):localStorage.removeItem(GK);}

// ─── STATE ───────────────────────────────────────────────────
let S={
  tab:'dash',data:ld(),geminiKey:lk(),drawerOpen:false,
  modal:null,viewMk:curMk(),billsMk:curMk(),chartCycleKey:'',chartMonthKey:curMk(),selectedMealDate:toStr(),
  auditOpen:false,
  airTimer:null,weatherLoading:false,weatherErr:'',
  // setup
  setupInput:'',setupErr:'',setupLoading:false,setupShow:false,
  // forms
  txF:{amount:'',discount:'',source:'Carinderia',note:'',date:toStr(),qty:'1',unit:'pcs',stockCategory:'Food Staples'},
  homeF:{amount:'',unitPrice:'',discount:'',qty:'1',unit:'pcs',category:'Cleaning Supplies',name:'',store:'Supermarket',note:'',date:toStr()},
  priceF:{name:'',store:'Palengke',price:'',unit:'pcs',category:'Food',subcat:'Ulam (Viand)',note:''},
  stockF:{name:'',category:'Food Staples',quantity:'',unit:'pcs',minQty:'1',note:''},
  airconF:{date:toStr(),start:'22:00',end:'06:00',mode:'sleep',sleepMode:true,tempC:'29',roomTemp:'',outdoorTemp:'',outdoorFeels:'',outdoorHumidity:''},
  tvF:{date:toStr(),start:'19:00',end:'22:00'},
  applianceF:{name:'',category:'Others',watts:'',qty:'1',sessionMinutes:'60',alwaysOn:false,note:''},
  applianceSessionF:{applianceId:'',date:toStr(),start:'19:00',end:'20:00',minutes:''},
  auditF:{startDate:'2026-05-31',startTime:'16:05',startRead:'43183',endDate:'2026-06-02',endTime:'18:03',endRead:'43199'},
  airSetF:{rate:'',readDay:'',startup:'',sleepDay:'',sleepNight:'',ecoDay:'',ecoNight:'',day:'',night:'',defaultMode:'sleep',defaultSleep:true,defaultTemp:'',tempBaseline:'29',tempStep:'7',outdoorBaseline:'30',outdoorStep:'2.5',tvWatts:''},
  airconProfileF:{model:'',outdoorModel:'',coolingKw:'',ratedWatts:'',minWatts:'',maxWatts:'',cspf:'',doeMonthlyKwh:''},
  settingsF:{geminiKey:'',weatherProvider:'open-meteo',weatherLabel:'',weatherLat:'',weatherLon:'',weatherElevation:'',weatherApiKey:''},
  listsF:{foodSources:'',homeCategories:'',homeStores:'',applianceCategories:'',dailyBudget:'380',groceryBudget:'5000'},
  billF:{name:''},
  balInput:'',
  // scan
  scanImg:null,scanMime:'',scanning:false,scanData:null,scanErr:'',addedIdx:new Set(),
  // filters
  pCat:'All',pSearch:'',homeCat:'All',stockCat:'All',stockStatus:'All',
  multiFood:false,multiHome:false,selFood:new Set(),selHome:new Set(),
  // edit
  editType:null,editId:null,editDraft:null,batchType:null,batchDraft:null,
  // bill drafts (no re-render on type)
  billDraft:{},
  // reports
  rptMk:curMk(),
};
let openSw=null;
let liveTick=null;
function set(p){if(typeof p==='function')Object.assign(S,p(S));else Object.assign(S,p);render();}
function setD(fn){const d=fn(S.data);sd(d);S.data=d;render();}

function ensureLiveTick(){
  const hasActive=(S.data.activeSessions||[]).length>0;
  if(hasActive&&!liveTick)liveTick=setInterval(()=>{if((S.data.activeSessions||[]).length&&!S.modal)render();},30000);
  if(!hasActive&&liveTick){clearInterval(liveTick);liveTick=null;}
}

async function updateWeather(force=false){
  if(S.weatherLoading||(!force&&!weatherStale(S.data)))return;
  const ws=weatherSettings(S.data);
  if(ws.provider!=='open-meteo')return;
  S.weatherLoading=true;S.weatherErr='';render();
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(ws.lat)}&longitude=${encodeURIComponent(ws.lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=Asia%2FManila&forecast_days=1`;
    const res=await fetch(url);
    if(!res.ok)throw new Error('Weather request failed');
    const json=await res.json(),cur=json.current||{};
    const weather={source:'Open-Meteo',label:ws.label,lat:ws.lat,lon:ws.lon,modelLat:json.latitude,modelLon:json.longitude,elevation:json.elevation??ws.elevation,temp:cur.temperature_2m,humidity:cur.relative_humidity_2m,apparent:cur.apparent_temperature,wind:cur.wind_speed_10m,code:cur.weather_code,time:cur.time,fetchedAt:new Date().toISOString()};
    S.weatherLoading=false;S.weatherErr='';
    setD(d=>({...d,weather}));
  }catch(e){
    S.weatherLoading=false;S.weatherErr=e.message||'Weather unavailable';render();
  }
}
function ensureWeather(){if(!S.modal&&!S.weatherLoading&&weatherStale(S.data))updateWeather();}

// ─── ACTIONS ────────────────────────────────────────────────
function addTx(){
  const isFreeMeal=S.txF.source==='Home-cooked';
  const gross=isFreeMeal?0:Math.max(0,parseFloat(S.txF.amount)||0),discount=isFreeMeal?0:Math.max(0,parseFloat(S.txF.discount)||0),amt=Math.max(0,gross-discount);
  if((!isFreeMeal&&(!gross||gross<=0||amt<=0))||(isFreeMeal&&!S.txF.note.trim()))return;
  const isGroceries=S.txF.source==='Groceries',stockId=isGroceries?uid():null;
  const tx={id:uid(),amount:amt,grossAmount:gross,discount,source:S.txF.source,note:S.txF.note,date:S.txF.date,...(isGroceries?{qty:parseFloat(S.txF.qty)||1,unit:S.txF.unit||'pcs',stockCategory:S.txF.stockCategory||'Food Staples',linkedStockId:stockId}:{})};
  setD(d=>({...d,balance:d.balance-amt,transactions:[tx,...d.transactions],stocks:isGroceries?[...(d.stocks||[]),stockFromGrocery(tx,stockId)]:(d.stocks||[])}));
  set({txF:{amount:'',discount:'',source:'Carinderia',note:'',date:toStr(),qty:'1',unit:'pcs',stockCategory:'Food Staples'},modal:null});
}
function delTx(id){const tx=S.data.transactions.find(t=>t.id===id);if(!tx)return;setD(d=>({...d,balance:d.balance+tx.amount,transactions:d.transactions.filter(t=>t.id!==id),stocks:tx.linkedStockId?(d.stocks||[]).filter(s=>s.id!==tx.linkedStockId):(d.stocks||[])}));}
function addHome(){
  const qty=parseFloat(S.homeF.qty)||1,unitPrice=parseFloat(S.homeF.unitPrice||S.homeF.amount),gross=unitPrice*qty,discount=Math.max(0,parseFloat(S.homeF.discount)||0),amt=Math.max(0,gross-discount);if(!amt||!S.homeF.name)return;
  const stockId=uid();
  const item={id:uid(),amount:amt,grossAmount:gross,discount,unitPrice,qty,unit:S.homeF.unit||'pcs',linkedStockId:stockId,category:S.homeF.category,name:S.homeF.name,store:S.homeF.store,note:S.homeF.note,date:S.homeF.date};
  setD(d=>({...d,balance:d.balance-amt,homeExpenses:[item,...(d.homeExpenses||[])],stocks:[...(d.stocks||[]),stockFromHome(item,stockId)]}));
  set({homeF:{amount:'',unitPrice:'',discount:'',qty:'1',unit:'pcs',category:'Cleaning Supplies',name:'',store:'Supermarket',note:'',date:toStr()},modal:null});
}
function delHome(id){const e=(S.data.homeExpenses||[]).find(x=>x.id===id);if(!e)return;setD(d=>({...d,balance:d.balance+e.amount,homeExpenses:(d.homeExpenses||[]).filter(x=>x.id!==id),stocks:e.linkedStockId?(d.stocks||[]).filter(s=>s.id!==e.linkedStockId):(d.stocks||[])}));}
function toggleSel(type,id){
  const key=type==='food'?'selFood':'selHome';
  const next=new Set(S[key]);next.has(id)?next.delete(id):next.add(id);set({[key]:next});
}
function clearMulti(type){
  if(type==='food')set({multiFood:false,selFood:new Set()});
  else set({multiHome:false,selHome:new Set()});
}
function delSelected(type){
  const ids=type==='food'?S.selFood:S.selHome;if(!ids.size)return;
  if(type==='food'){
    const txs=(S.data.transactions||[]).filter(t=>ids.has(t.id));
    const total=txs.reduce((s,t)=>s+t.amount,0),stockIds=new Set(txs.map(t=>t.linkedStockId).filter(Boolean));
    setD(d=>({...d,balance:d.balance+total,transactions:(d.transactions||[]).filter(t=>!ids.has(t.id)),stocks:(d.stocks||[]).filter(s=>!stockIds.has(s.id))}));
  }else{
    const items=(S.data.homeExpenses||[]).filter(e=>ids.has(e.id));
    const total=items.reduce((s,e)=>s+e.amount,0),stockIds=new Set(items.map(e=>e.linkedStockId).filter(Boolean));
    setD(d=>({...d,balance:d.balance+total,homeExpenses:(d.homeExpenses||[]).filter(e=>!ids.has(e.id)),stocks:(d.stocks||[]).filter(s=>!stockIds.has(s.id))}));
  }
  clearMulti(type);
}
function openBatchEdit(type){const ids=type==='food'?S.selFood:S.selHome;if(!ids.size)return;set({modal:'batchEdit',batchType:type,batchDraft:{note:'',date:''}});}
function addPrice(){
  const price=parseFloat(S.priceF.price);if(!S.priceF.name||!price)return;
  setD(d=>({...d,priceItems:[...(d.priceItems||[]),{id:uid(),...S.priceF,price,addedAt:new Date().toISOString()}]}));
  set({priceF:{name:'',store:'Palengke',price:'',unit:'pcs',category:'Food',subcat:'Ulam (Viand)',note:''},modal:null});
}
function delPrice(id){setD(d=>({...d,priceItems:d.priceItems.filter(p=>p.id!==id)}));}
function addStock(){
  if(!S.stockF.name)return;
  const item={id:uid(),name:S.stockF.name,category:S.stockF.category,quantity:parseFloat(S.stockF.quantity)||0,unit:S.stockF.unit||'pcs',minQty:parseFloat(S.stockF.minQty)||0,note:S.stockF.note};
  setD(d=>({...d,stocks:[...(d.stocks||[]),item]}));
  set({stockF:{name:'',category:'Food Staples',quantity:'',unit:'pcs',minQty:'1',note:''},modal:null});
}
function delStock(id){setD(d=>({...d,stocks:(d.stocks||[]).filter(s=>s.id!==id)}));}
function adjStock(id,delta){setD(d=>({...d,stocks:(d.stocks||[]).map(s=>s.id===id?{...s,quantity:Math.max(0,s.quantity+delta)}:s)}));}
function addAircon(){
  const d=S.data,rates=airconRates(d);
  const mode=airconModeFrom(S.airconF.mode,S.airconF.sleepMode);
  const tempC=parseFloat(S.airconF.tempC);
  const roomTemp=parseFloat(S.airconF.roomTemp);
  const outdoorTemp=parseFloat(S.airconF.outdoorTemp),outdoorFeels=parseFloat(S.airconF.outdoorFeels),outdoorHumidity=parseFloat(S.airconF.outdoorHumidity);
  const session=airconSessionFromParts(S.airconF.date,S.airconF.start,S.airconF.end,mode,rates,isNaN(tempC)?'':tempC,isNaN(outdoorTemp)?'':outdoorTemp,d);if(!session)return;
  const cost=session.kwh*d.meralcoRate;
  const entry={id:uid(),...session,hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost,rateAtTime:d.meralcoRate,ratesAtTime:rates,tempC:isNaN(tempC)?'':tempC,roomTemp:isNaN(roomTemp)?'':roomTemp,outdoorTemp:isNaN(outdoorTemp)?'':outdoorTemp,outdoorFeels:isNaN(outdoorFeels)?'':outdoorFeels,outdoorHumidity:isNaN(outdoorHumidity)?'':outdoorHumidity,weatherAtTime:d.weather||null,formula:'two-phase-inverter'};
  setD(d=>({...d,airconUsage:[entry,...(d.airconUsage||[])]}));
  set({airconF:{date:toStr(),start:S.airconF.start,end:S.airconF.end,mode,sleepMode:mode==='sleep',tempC:S.airconF.tempC,roomTemp:S.airconF.roomTemp,outdoorTemp:S.airconF.outdoorTemp,outdoorFeels:S.airconF.outdoorFeels,outdoorHumidity:S.airconF.outdoorHumidity},modal:null});
}
function delAircon(id){setD(d=>({...d,airconUsage:S.data.airconUsage.filter(x=>x.id!==id)}));}
function addTv(){
  const sm=minsOfDay(S.tvF.start),em=minsOfDay(S.tvF.end);if(isNaN(sm)||isNaN(em))return;
  let mins=em-sm;if(mins<=0)mins+=1440;
  const h=mins/60;
  const d=S.data,watts=parseFloat(d.tvWatts)||175;
  const kwh=(watts/1000)*h,cost=kwh*d.meralcoRate;
  const entry={id:uid(),date:S.tvF.date,start:S.tvF.start,end:S.tvF.end,minutes:mins,hours:h,watts,kwh,cost,rateAtTime:d.meralcoRate};
  setD(d=>({...d,tvUsage:[entry,...(d.tvUsage||[])]}));
  set({tvF:{date:toStr(),start:S.tvF.start,end:S.tvF.end},modal:null});
}
function delTv(id){setD(d=>({...d,tvUsage:(d.tvUsage||[]).filter(x=>x.id!==id)}));}
function addAppliance(){
  const watts=parseFloat(S.applianceF.watts),qty=parseFloat(S.applianceF.qty)||1;
  const sessionMinutes=S.applianceF.alwaysOn?0:(parseFloat(S.applianceF.sessionMinutes)||0);
  if(!S.applianceF.name||!watts||watts<=0||qty<=0||(!S.applianceF.alwaysOn&&!sessionMinutes))return;
  const item={id:uid(),name:S.applianceF.name,category:S.applianceF.category,watts,qty,hoursPerDay:S.applianceF.alwaysOn?24:0,daysPerMonth:S.applianceF.alwaysOn?30:0,sessionMinutes,alwaysOn:!!S.applianceF.alwaysOn,note:S.applianceF.note};
  setD(d=>({...d,appliances:[item,...(d.appliances||[])]}));
  set({applianceF:{name:'',category:'Others',watts:'',qty:'1',sessionMinutes:'60',alwaysOn:false,note:''},modal:null});
}
function delAppliance(id){setD(d=>({...d,appliances:(d.appliances||[]).filter(x=>x.id!==id)}));}
function addApplianceUsage(){
  const appliances=S.data.appliances||[];
  const ap=appliances.find(a=>a.id===S.applianceSessionF.applianceId)||appliances.find(a=>!a.alwaysOn);
  const start=S.applianceSessionF.start||'19:00',end=S.applianceSessionF.end||timePlus(start,parseFloat(ap?.sessionMinutes)||60)||'20:00';
  const minutes=minutesBetween(start,end);
  if(!ap||ap.alwaysOn||!minutes)return;
  const est=applianceSessionEstimate(ap,minutes,S.data.meralcoRate);
  const entry={id:uid(),applianceId:ap.id,name:ap.name,category:ap.category,date:S.applianceSessionF.date,start,end,minutes,hours:minutes/60,watts:parseFloat(ap.watts)||0,qty:parseFloat(ap.qty)||1,kwh:est.kwh,cost:est.cost,rateAtTime:S.data.meralcoRate};
  setD(d=>({...d,applianceUsage:[entry,...(d.applianceUsage||[])]}));
  set({applianceSessionF:{applianceId:ap.id,date:toStr(),start,end:timePlus(start,ap.sessionMinutes||minutes),minutes:String(ap.sessionMinutes||minutes)},modal:null});
}
function delApplianceUsage(id){setD(d=>({...d,applianceUsage:(d.applianceUsage||[]).filter(x=>x.id!==id)}));}
function startActiveSession(type,opts={}){
  const d=S.data;
  const exists=(d.activeSessions||[]).some(s=>s.type===type&&(type!=='appliance'||s.applianceId===opts.applianceId));
  if(exists)return;
  if(type==='aircon'){
    const mode=airconModeFrom(opts.mode||d.airconDefaultMode,opts.sleepMode??d.airconDefaultSleepMode),tempC=parseFloat(opts.tempC??d.airconDefaultTemp);
    const w=d.weather||{};
    const outdoorTemp=opts.outdoorTemp??w.temp??'',outdoorFeels=opts.outdoorFeels??w.apparent??'',outdoorHumidity=opts.outdoorHumidity??w.humidity??'';
    const s={id:uid(),type,name:'Aircon',startedAt:new Date().toISOString(),mode,sleepMode:mode==='sleep',tempC:isNaN(tempC)?'':tempC,roomTemp:opts.roomTemp??'',outdoorTemp,outdoorFeels,outdoorHumidity,weatherAtStart:w};
    setD(d=>({...d,activeSessions:[s,...(d.activeSessions||[])]}));
  }else if(type==='tv'){
    const watts=parseFloat(d.tvWatts)||175;
    const s={id:uid(),type,name:'TV',startedAt:new Date().toISOString(),watts,qty:1};
    setD(d=>({...d,activeSessions:[s,...(d.activeSessions||[])]}));
  }else if(type==='appliance'){
    const ap=(d.appliances||[]).find(a=>a.id===opts.applianceId);
    if(!ap||ap.alwaysOn)return;
    const s={id:uid(),type,name:ap.name,applianceId:ap.id,category:ap.category,startedAt:new Date().toISOString(),watts:parseFloat(ap.watts)||0,qty:parseFloat(ap.qty)||1};
    setD(d=>({...d,activeSessions:[s,...(d.activeSessions||[])]}));
  }
}
function cancelActiveSession(id){setD(d=>({...d,activeSessions:(d.activeSessions||[]).filter(s=>s.id!==id)}));}
function stopActiveSession(id){
  const active=(S.data.activeSessions||[]).find(s=>s.id===id);if(!active)return;
  const now=new Date(),rate=S.data.meralcoRate||14.3345;
  setD(d=>{
    const activeSessions=(d.activeSessions||[]).filter(s=>s.id!==id);
    if(active.type==='aircon'){
      const mode=airconModeFrom(active.mode,active.sleepMode);
      const session=airconSessionFromDates(new Date(active.startedAt),now,mode,airconRates(d),active.tempC,active.outdoorTemp,d);
      const entry={id:uid(),...session,hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost:session.kwh*rate,rateAtTime:rate,ratesAtTime:airconRates(d),tempC:active.tempC??'',roomTemp:active.roomTemp??'',outdoorTemp:active.outdoorTemp??'',outdoorFeels:active.outdoorFeels??'',outdoorHumidity:active.outdoorHumidity??'',weatherAtTime:active.weatherAtStart||d.weather||null,formula:'two-phase-inverter'};
      return{...d,activeSessions,airconUsage:[entry,...(d.airconUsage||[])]};
    }
    const minutes=activeElapsedMinutes(active,now);
    if(active.type==='tv'){
      const startDt=new Date(active.startedAt),watts=parseFloat(active.watts)||parseFloat(d.tvWatts)||175,kwh=watts*(minutes/60)/1000;
      const entry={id:uid(),date:dateOf(startDt),start:timeOf(startDt),end:timeOf(now),minutes,hours:minutes/60,watts,kwh,cost:kwh*rate,rateAtTime:rate};
      return{...d,activeSessions,tvUsage:[entry,...(d.tvUsage||[])]};
    }
    const ap=(d.appliances||[]).find(a=>a.id===active.applianceId);
    const watts=parseFloat(ap?.watts)||parseFloat(active.watts)||0,qty=parseFloat(ap?.qty)||parseFloat(active.qty)||1,kwh=watts*qty*(minutes/60)/1000;
    const startDt=new Date(active.startedAt);
    const entry={id:uid(),applianceId:active.applianceId,name:ap?.name||active.name,category:ap?.category||active.category||'Others',date:dateOf(startDt),start:timeOf(startDt),end:timeOf(now),minutes,hours:minutes/60,watts,qty,kwh,cost:kwh*rate,rateAtTime:rate};
    return{...d,activeSessions,applianceUsage:[entry,...(d.applianceUsage||[])]};
  });
}
function saveAirSet(){
  setD(d=>({...d,
    meralcoRate:numIn(S.airSetF.rate,d.meralcoRate||14.3345,1,100),
    airconStartupRate:numIn(S.airSetF.startup,d.airconStartupRate||DEFAULT_AIRCON_RATES.startup,0.05,3),
    airconSleepDayRate:numIn(S.airSetF.sleepDay,d.airconSleepDayRate||DEFAULT_AIRCON_RATES.sleepDay,0.05,3),
    airconSleepNightRate:numIn(S.airSetF.sleepNight,d.airconSleepNightRate||DEFAULT_AIRCON_RATES.sleepNight,0.05,3),
    airconEcoDayRate:numIn(S.airSetF.ecoDay,d.airconEcoDayRate||DEFAULT_AIRCON_RATES.ecoDay,0.05,3),
    airconEcoNightRate:numIn(S.airSetF.ecoNight,d.airconEcoNightRate||DEFAULT_AIRCON_RATES.ecoNight,0.05,3),
    airconDayRate:numIn(S.airSetF.day,d.airconDayRate||DEFAULT_AIRCON_RATES.day,0.05,3),
    airconNightRate:numIn(S.airSetF.night,d.airconNightRate||DEFAULT_AIRCON_RATES.night,0.05,3),
    airconDefaultMode:airconModeFrom(S.airSetF.defaultMode,S.airSetF.defaultSleep),
    airconDefaultSleepMode:airconModeFrom(S.airSetF.defaultMode,S.airSetF.defaultSleep)==='sleep',
    airconDefaultTemp:numIn(S.airSetF.defaultTemp,d.airconDefaultTemp||29,16,32),
    airconTempBaseline:numIn(S.airSetF.tempBaseline,d.airconTempBaseline||29,16,32),
    airconTempStepPct:numIn(S.airSetF.tempStep,d.airconTempStepPct||7,0,20),
    airconOutdoorBaseline:numIn(S.airSetF.outdoorBaseline,d.airconOutdoorBaseline||30,15,45),
    airconOutdoorStepPct:numIn(S.airSetF.outdoorStep,d.airconOutdoorStepPct||2.5,0,10),
    tvWatts:numIn(S.airSetF.tvWatts,d.tvWatts||175,1,1000),
    meralcoReadDay:Math.max(1,Math.min(31,parseInt(S.airSetF.readDay)||d.meralcoReadDay||12))
  }));
  set({modal:null});
}
function airconProfile(data=S.data){
  return{
    model:data.airconModel||AIRCON_MODEL_PROFILE.model,
    outdoorModel:data.airconOutdoorModel||AIRCON_MODEL_PROFILE.outdoorModel,
    coolingKw:parseFloat(data.airconCoolingKw)||AIRCON_MODEL_PROFILE.coolingKw,
    ratedWatts:parseFloat(data.airconRatedWatts)||AIRCON_MODEL_PROFILE.ratedWatts,
    minWatts:parseFloat(data.airconMinWatts)||AIRCON_MODEL_PROFILE.minWatts,
    maxWatts:parseFloat(data.airconMaxWatts)||AIRCON_MODEL_PROFILE.maxWatts,
    cspf:parseFloat(data.airconCspf)||AIRCON_MODEL_PROFILE.cspf,
    doeMonthlyKwh:parseFloat(data.airconDoeMonthlyKwh)||AIRCON_MODEL_PROFILE.doeMonthlyKwh
  };
}
function openAirconProfile(){
  const p=airconProfile();
  set({modal:'airconProfile',airconProfileF:{...p}});
}
function saveAirconProfile(){
  const p=S.airconProfileF||{};
  setD(d=>({...d,
    airconModel:p.model||AIRCON_MODEL_PROFILE.model,
    airconOutdoorModel:p.outdoorModel||AIRCON_MODEL_PROFILE.outdoorModel,
    airconCoolingKw:parseFloat(p.coolingKw)||AIRCON_MODEL_PROFILE.coolingKw,
    airconRatedWatts:parseFloat(p.ratedWatts)||AIRCON_MODEL_PROFILE.ratedWatts,
    airconMinWatts:parseFloat(p.minWatts)||AIRCON_MODEL_PROFILE.minWatts,
    airconMaxWatts:parseFloat(p.maxWatts)||AIRCON_MODEL_PROFILE.maxWatts,
    airconCspf:parseFloat(p.cspf)||AIRCON_MODEL_PROFILE.cspf,
    airconDoeMonthlyKwh:parseFloat(p.doeMonthlyKwh)||AIRCON_MODEL_PROFILE.doeMonthlyKwh
  }));
  set({modal:null});
}
function openSettings(){
  const ws=weatherSettings(S.data);
  set({modal:'settings',drawerOpen:false,settingsF:{geminiKey:S.geminiKey,weatherProvider:ws.provider,weatherLabel:ws.label,weatherLat:String(ws.lat),weatherLon:String(ws.lon),weatherElevation:String(ws.elevation),weatherApiKey:ws.apiKey||''}});
}
function openListsDefaults(){
  const d=S.data;
  set({tab:'lists',modal:null,drawerOpen:false,listsF:{
    foodSources:foodSources(d).join('\n'),
    homeCategories:homeCategories(d).join('\n'),
    homeStores:homeStores(d).join('\n'),
    applianceCategories:applianceCategories(d).join('\n'),
    dailyBudget:String(d.dailyBudget||380),
    groceryBudget:String(d.groceryBudget||5000)
  }});
}
function saveListsDefaults(){
  const f=S.listsF||{};
  const labels={
    foodSources:parseLabels(f.foodSources),
    homeCategories:parseLabels(f.homeCategories),
    homeStores:parseLabels(f.homeStores),
    applianceCategories:parseLabels(f.applianceCategories)
  };
  Object.keys(LABEL_DEFAULTS).forEach(k=>{if(!labels[k].length)labels[k]=LABEL_DEFAULTS[k];});
  setD(d=>({...d,labels,dailyBudget:numIn(f.dailyBudget,d.dailyBudget||380,50,2000),groceryBudget:numIn(f.groceryBudget,d.groceryBudget||5000,0,50000)}));
  set({modal:null});
}
function saveSettings(){
  const f=S.settingsF||{},key=(f.geminiKey||'').trim();
  sk(key);
  const old=weatherSettings(S.data);
  const next={provider:f.weatherProvider||'open-meteo',label:f.weatherLabel||DEFAULT_WEATHER.label,lat:parseFloat(f.weatherLat)||DEFAULT_WEATHER.lat,lon:parseFloat(f.weatherLon)||DEFAULT_WEATHER.lon,elevation:parseFloat(f.weatherElevation)||DEFAULT_WEATHER.elevation,apiKey:f.weatherApiKey||''};
  const changed=old.lat!==next.lat||old.lon!==next.lon||old.provider!==next.provider;
  setD(d=>({...d,weatherProvider:next.provider,weatherLabel:next.label,weatherLat:next.lat,weatherLon:next.lon,weatherElevation:next.elevation,weatherApiKey:next.apiKey,weather:changed?null:d.weather}));
  set({geminiKey:key,modal:null,weatherErr:''});
  setTimeout(()=>updateWeather(true),50);
}
function exportData(){
  const blob=new Blob([JSON.stringify(S.data,null,2)],{type:'application/json'});
  const a=h('a',{href:URL.createObjectURL(blob),download:`budget-tracker-${toStr()}.json`});
  a.click();
}
function importData(e){
  const reader=new FileReader();reader.onload=ev=>{
    try{const d=JSON.parse(ev.target.result);if(confirm('Overwrite current data?')){sd(d);S.data=d;render();alert('Imported!');}}
    catch{alert('Invalid file');}
  };reader.readAsText(e.target.files[0]);
}
function setBillAmt(id,m,val){setD(d=>({...d,bills:d.bills.map(b=>b.id===id?{...b,monthlyAmounts:{...b.monthlyAmounts,[m]:parseFloat(val)||0}}:b)}));}
function setBillKwh(id,m,val){setD(d=>({...d,bills:d.bills.map(b=>b.id===id?{...b,monthlyKwh:{...(b.monthlyKwh||{}),[m]:parseFloat(val)||0}}:b)}));}
function toggleBillPaid(id,m){setD(d=>({...d,bills:d.bills.map(b=>b.id===id?{...b,paid:{...b.paid,[m]:!b.paid[m]}}:b)}));}
function addBill(){if(!S.billF.name)return;setD(d=>({...d,bills:[...d.bills,{id:uid(),name:S.billF.name,monthlyAmounts:{},...(S.billF.name.toLowerCase().includes('electric')?{monthlyKwh:{}}:{}),paid:{}}]}));set({billF:{name:''},modal:null});}
function delBill(id){setD(d=>({...d,bills:d.bills.filter(b=>b.id!==id)}));}
function updBal(){const v=parseFloat(S.balInput.replace(/,/g,''));if(!isNaN(v)){setD(d=>({...d,balance:v}));set({modal:null});}}
function openEdit(type,id){
  let item;
  if(type==='food')item=S.data.transactions.find(t=>t.id===id);
  else if(type==='home')item=(S.data.homeExpenses||[]).find(e=>e.id===id);
  else if(type==='aircon')item=(S.data.airconUsage||[]).find(e=>e.id===id);
  else if(type==='tv')item=(S.data.tvUsage||[]).find(e=>e.id===id);
  else if(type==='appliance')item=(S.data.appliances||[]).find(e=>e.id===id);
  else if(type==='applianceUsage')item=(S.data.applianceUsage||[]).find(e=>e.id===id);
  else if(type==='price')item=S.data.priceItems.find(p=>p.id===id);
  else if(type==='stock')item=(S.data.stocks||[]).find(s=>s.id===id);
  if(!item)return;
  set({modal:'edit',editType:type,editId:id,editDraft:{...item}});
}
function saveEdit(){
  const{editType:t,editId:id,editDraft:dr}=S;
  if(t==='food'){
    const old=S.data.transactions.find(x=>x.id===id);
    const isFreeMeal=dr.source==='Home-cooked';
    const gross=isFreeMeal?0:Math.max(0,parseFloat(dr.grossAmount??dr.amount)||0);
    const discount=isFreeMeal?0:Math.max(0,parseFloat(dr.discount)||0);
    const newAmt=Math.max(0,gross-discount);
    const delta=newAmt-old.amount;
    setD(d=>{
      let stocks=[...(d.stocks||[])];
      let updated={...old,...dr,grossAmount:gross,discount,amount:newAmt};
      if(updated.source==='Groceries'&&!updated.linkedStockId){
        const stockId=uid();
        updated={...updated,linkedStockId:stockId,qty:parseFloat(updated.qty)||1,unit:updated.unit||'pcs',stockCategory:updated.stockCategory||'Food Staples'};
        stocks.push(stockFromGrocery(updated,stockId));
      }else if(updated.source!=='Groceries'&&updated.linkedStockId){
        stocks=stocks.filter(s=>s.id!==updated.linkedStockId);
        const{linkedStockId,stockName,stockCategory,qty,unit,subcat,...rest}=updated;
        updated=rest;
      }else if(updated.source==='Groceries'&&updated.linkedStockId){
        stocks=stocks.map(s=>s.id===updated.linkedStockId?{...s,...stockFromGrocery(updated,updated.linkedStockId)}:s);
      }
      return {...d,balance:d.balance-delta,transactions:d.transactions.map(x=>x.id===id?updated:x),stocks};
    });
  } else if(t==='home'){
    const old=(S.data.homeExpenses||[]).find(x=>x.id===id);
    const qty=parseFloat(dr.qty)||1;
    const unitPrice=parseFloat(dr.unitPrice)||parseFloat(dr.amount)||old.unitPrice||old.amount;
    const gross=unitPrice*qty,discount=Math.max(0,parseFloat(dr.discount)||0);
    const newAmt=Math.max(0,gross-discount);
    const delta=newAmt-old.amount;
    const updated={...old,...dr,qty,unitPrice,grossAmount:gross,discount,amount:newAmt,unit:dr.unit||old.unit||'pcs'};
    setD(d=>{
      let stocks=d.stocks||[];
      if(updated.linkedStockId){
        const stock=stockFromHome(updated,updated.linkedStockId);
        stocks=stocks.some(s=>s.id===updated.linkedStockId)?stocks.map(s=>s.id===updated.linkedStockId?{...s,...stock}:s):[...stocks,stock];
      }
      return {...d,balance:d.balance-delta,homeExpenses:(d.homeExpenses||[]).map(x=>x.id===id?updated:x),stocks};
    });
  } else if(t==='aircon'){
    const old=(S.data.airconUsage||[]).find(x=>x.id===id);
    const rates=airconRates(S.data);
    const mode=airconModeFrom(dr.mode,dr.sleepMode);
    const tempC=parseFloat(dr.tempC);
    const roomTemp=parseFloat(dr.roomTemp);
    const outdoorTemp=parseFloat(dr.outdoorTemp);
    const session=airconSessionFromParts(dr.date||old.date,dr.start||old.start||'22:00',dr.end||old.end||'06:00',mode,rates,isNaN(tempC)?'':tempC,isNaN(outdoorTemp)?'':outdoorTemp,S.data);
    if(!session)return;
    const newCost=session.kwh*S.data.meralcoRate;
    setD(d=>({...d,airconUsage:(d.airconUsage||[]).map(x=>x.id===id?{...old,...dr,...session,mode,sleepMode:mode==='sleep',hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost:newCost,rateAtTime:S.data.meralcoRate,ratesAtTime:rates,tempC:isNaN(tempC)?'':tempC,roomTemp:isNaN(roomTemp)?'':roomTemp,formula:'two-phase-inverter'}:x)}));
  } else if(t==='tv'){
    const old=(S.data.tvUsage||[]).find(x=>x.id===id);
    if(!dr.start)dr.start=old.start||'19:00';if(!dr.end)dr.end=old.end||timePlus(dr.start,(parseFloat(dr.hours)||1)*60)||'22:00';
    const sm=minsOfDay(dr.start),em=minsOfDay(dr.end);if(isNaN(sm)||isNaN(em))return;
    let minutes=em-sm;if(minutes<=0)minutes+=1440;
    const hours=minutes/60,watts=parseFloat(dr.watts)||S.data.tvWatts||175;
    const kwh=(watts/1000)*hours,cost=kwh*S.data.meralcoRate;
    setD(d=>({...d,tvUsage:(d.tvUsage||[]).map(x=>x.id===id?{...old,...dr,minutes,hours,watts,kwh,cost,rateAtTime:S.data.meralcoRate}:x)}));
  } else if(t==='appliance'){
    const watts=parseFloat(dr.watts)||0,qty=parseFloat(dr.qty)||1;
    const sessionMinutes=dr.alwaysOn?0:(parseFloat(dr.sessionMinutes)||0);
    if(!dr.name||!watts||(!dr.alwaysOn&&!sessionMinutes))return;
    setD(d=>({...d,appliances:(d.appliances||[]).map(x=>x.id===id?{...x,...dr,watts,qty,hoursPerDay:dr.alwaysOn?24:0,daysPerMonth:dr.alwaysOn?30:0,sessionMinutes,alwaysOn:!!dr.alwaysOn}:x)}));
  } else if(t==='applianceUsage'){
    const old=(S.data.applianceUsage||[]).find(x=>x.id===id);
    const appliance=(S.data.appliances||[]).find(a=>a.id===(dr.applianceId||old.applianceId));
    const start=dr.start||old.start||'19:00',end=dr.end||old.end||timePlus(start,parseFloat(old.minutes)||parseFloat(appliance?.sessionMinutes)||60)||'20:00';
    const minutes=minutesBetween(start,end)||parseFloat(dr.minutes)||old.minutes;
    const watts=parseFloat(appliance?.watts)||parseFloat(dr.watts)||old.watts||0;
    const qty=parseFloat(appliance?.qty)||parseFloat(dr.qty)||old.qty||1;
    const kwh=watts*qty*(minutes/60)/1000,cost=kwh*S.data.meralcoRate;
    setD(d=>({...d,applianceUsage:(d.applianceUsage||[]).map(x=>x.id===id?{...old,...dr,applianceId:appliance?.id||old.applianceId,name:appliance?.name||dr.name||old.name,category:appliance?.category||old.category,start,end,minutes,hours:minutes/60,watts,qty,kwh,cost,rateAtTime:S.data.meralcoRate}:x)}));
  } else if(t==='price'){
    setD(d=>({...d,priceItems:d.priceItems.map(p=>p.id===id?{...p,...dr,price:parseFloat(dr.price)||p.price}:p)}));
  } else if(t==='stock'){
    setD(d=>({...d,stocks:(d.stocks||[]).map(s=>s.id===id?{...s,...dr,quantity:parseFloat(dr.quantity)||0,minQty:parseFloat(dr.minQty)||0}:s)}));
  }
  set({modal:null,editType:null,editId:null,editDraft:null});
}
function saveBatchEdit(){
  const type=S.batchType,dr=S.batchDraft||{},ids=type==='food'?S.selFood:S.selHome;
  if(!ids?.size){set({modal:null,batchType:null,batchDraft:null});return;}
  if(type==='food'){
    setD(d=>{
      let stocks=[...(d.stocks||[])];
      const transactions=(d.transactions||[]).map(t=>{
        if(!ids.has(t.id))return t;
        let next={...t,source:dr.source||t.source,date:dr.date||t.date,note:dr.note?dr.note:t.note};
        if(next.source==='Groceries'&&!next.linkedStockId){
          const stockId=uid();
          next={...next,linkedStockId:stockId,qty:parseFloat(next.qty)||1,unit:next.unit||'pcs',stockCategory:next.stockCategory||'Food Staples'};
          stocks.push(stockFromGrocery(next,stockId));
        }else if(next.source!=='Groceries'&&next.linkedStockId){
          stocks=stocks.filter(s=>s.id!==next.linkedStockId);
          const{linkedStockId,stockName,stockCategory,qty,unit,subcat,...rest}=next;
          next=rest;
        }else if(next.source==='Groceries'&&next.linkedStockId){
          stocks=stocks.map(s=>s.id===next.linkedStockId?{...s,...stockFromGrocery(next,next.linkedStockId)}:s);
        }
        return next;
      });
      return {...d,transactions,stocks};
    });
  }else{
    setD(d=>{
      const homeExpenses=(d.homeExpenses||[]).map(e=>ids.has(e.id)?{...e,category:dr.category||e.category,store:dr.store||e.store,date:dr.date||e.date,note:dr.note?dr.note:e.note}:e);
      const byStock=new Map(homeExpenses.filter(e=>ids.has(e.id)&&e.linkedStockId).map(e=>[e.linkedStockId,e]));
      const stocks=(d.stocks||[]).map(s=>byStock.has(s.id)?{...s,...stockFromHome(byStock.get(s.id),s.id)}:s);
      return {...d,homeExpenses,stocks};
    });
  }
  clearMulti(type);set({modal:null,batchType:null,batchDraft:null});
}

// ─── GEMINI ─────────────────────────────────────────────────
function retryDelayFromError(err){
  const retry=err?.details?.find?.(d=>d['@type']?.includes('RetryInfo'))?.retryDelay;
  if(!retry)return '';
  return ` Try again in about ${retry.replace('s',' seconds')}.`;
}
function quotaMessage(err,attempted){
  const msg=err?.message||'Quota limit reached.';
  const quota=err?.details?.find?.(d=>d['@type']?.includes('QuotaFailure'))?.violations?.[0];
  const quotaId=quota?.quotaId?` (${quota.quotaId})`:'';
  const model=quota?.quotaDimensions?.model||attempted||'Gemini';
  return `${model} quota reached${quotaId}.${retryDelayFromError(err)} Google applies limits per project, so changing keys in the same project may not help.`;
}
function scanQty(item){
  const direct=parseFloat(item.qty??item.quantity);
  if(direct>0)return direct;
  const text=[item.note,item.unit].filter(Boolean).join(' ');
  const match=text.match(/(?:x|qty[:\s]*)(\d+(?:\.\d+)?)/i);
  return match?parseFloat(match[1]):1;
}
function scanTotal(item){
  return (parseFloat(item.price)||0)*scanQty(item);
}
async function setupKey(){
  const key=S.setupInput.trim();
  if(!key){set({setupErr:'Please enter your API key.'});return;}
  if(!key.startsWith('AIza')){set({setupErr:'Key should start with "AIza..." — check you copied it fully.'});return;}
  set({setupLoading:true,setupErr:''});
  try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const json=await res.json();
    if(json.error){
      const code=json.error.code,msg=(json.error.message||'').toLowerCase();
      const isBad=msg.includes('api key not valid')||msg.includes('invalid api key')||(code===400&&msg.includes('key'))||code===401;
      if(isBad){set({setupErr:'Invalid API key. Make sure you copied the full key from AI Studio.',setupLoading:false});return;}
      set({setupErr:'API key check failed: '+json.error.message,setupLoading:false});return;
    }
    sk(key);set({geminiKey:key,setupInput:'',setupErr:'',setupLoading:false});
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('api key not valid')||msg.includes('invalid')){set({setupErr:'Invalid API key.',setupLoading:false});return;}
    sk(key);set({geminiKey:key,setupInput:'',setupErr:'',setupLoading:false});
  }
}
async function doScan(){
  if(!S.geminiKey){set({scanErr:'Set your Gemini API key in Settings to enable AI scanning.'});return;}
  if(!S.scanImg)return;
  set({scanning:true,scanErr:'',scanData:null});
  const quotaErrors=[];
  for(const model of MODELS){
    console.log(`[Scanner] Trying ${model}...`);
    try{
      const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${S.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:S.scanMime,data:S.scanImg}},{text:SCAN_PROMPT}]}],generationConfig:{temperature:0.1,maxOutputTokens:900,responseMimeType:'application/json'}})});
      const json=await res.json();
      if(json.error){const msg=(json.error.message||'').toLowerCase();console.warn(`[Scanner] ${model} error:`, json.error);if(json.error.code===429||msg.includes('quota')||msg.includes('resource_exhausted')){quotaErrors.push(quotaMessage(json.error,model));continue;}if([403,404].includes(json.error.code)||msg.includes('not found')||msg.includes('permission'))continue;set({scanErr:'API Error: '+json.error.message,scanning:false});return;}
      const raw=json.candidates?.[0]?.content?.parts?.[0]?.text||'[]';
      set({scanData:JSON.parse(raw.replace(/```json|```/g,'').trim()),scanning:false});return;
    }catch(e){
      console.error(`[Scanner] ${model} fatal:`, e);
      const msg=(e.message||'').toLowerCase();
      if(msg.includes('quota')||msg.includes('resource_exhausted')||msg.includes('exceeded'))continue;
      set({scanErr:'Scan error: '+e.message,scanning:false});return;
    }
  }
  set({scanErr:quotaErrors[0]||'No available Gemini model could scan this image. Check your AI Studio quota page or try again later.',scanning:false});
}
function addScanned(item,idx,dest){
  const price=parseFloat(item.price),qty=scanQty(item),total=scanTotal(item);if(!item.name||!price)return;
  const key=`${idx}:${dest}`;
  const qtyNote=qty>1?`${qty} x ${fmt(price)}`:'';
  const note=[qtyNote,item.note,`From scan${item.store?' · '+item.store:''}`].filter(Boolean).join(' · ');
  if(dest==='price'){
    setD(d=>({...d,priceItems:[...(d.priceItems||[]),{id:uid(),name:item.name,store:item.store||'Unknown',price,unit:item.unit||'pcs',category:item.category||'Food',subcat:item.subcat||'Others',note:note||'From scan',addedAt:new Date().toISOString()}]}));
  } else if(dest==='food'){
    const source=foodSources().includes(item.store)&&item.store!=='Others'?item.store:'Groceries',isGrocery=source==='Groceries',stockId=isGrocery?uid():null;
    const tx={id:uid(),amount:total,source,note:[item.name,note].filter(Boolean).join(' · '),...(isGrocery?{stockName:item.name,qty,unit:item.unit||'pcs',stockCategory:stockCatFromFood(item.subcat),subcat:item.subcat||'',linkedStockId:stockId}:{}),date:toStr()};
    setD(d=>({...d,balance:d.balance-total,transactions:[tx,...(d.transactions||[])],stocks:isGrocery?[...(d.stocks||[]),stockFromGrocery(tx,stockId)]:(d.stocks||[])}));
  } else if(dest==='home'){
    const hcats=homeCategories(),cat=hcats.includes(item.subcat)?item.subcat:(hcats.includes(item.category)?item.category:'Toiletries & Personal Care');
    const stockId=uid();
    const homeItem={id:uid(),amount:total,unitPrice:price,qty,unit:item.unit||'pcs',linkedStockId:stockId,category:cat,name:item.name,store:item.store||'Others',note:note||'From scan',date:toStr()};
    setD(d=>({...d,balance:d.balance-total,homeExpenses:[homeItem,...(d.homeExpenses||[])],stocks:[...(d.stocks||[]),stockFromHome(homeItem,stockId)]}));
  }
  S.addedIdx=new Set([...S.addedIdx,key]);render();
}

// ─── DOM HELPERS ─────────────────────────────────────────────
function h(tag,attrs,...ch){
  const el=document.createElement(tag);
  if(attrs)for(const[k,v]of Object.entries(attrs)){
    if(k==='cls')el.className=v;
    else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2).toLowerCase(),v);
    else if(k==='style'&&typeof v==='object')Object.assign(el.style,v);
    else if(v!=null&&v!==false)el.setAttribute(k,v);
  }
  for(const c of ch.flat(Infinity)){if(c==null||c===false)continue;if(typeof c==='string'||typeof c==='number')el.appendChild(document.createTextNode(String(c)));else if(c instanceof Node)el.appendChild(c);}
  return el;
}
const D=(cls,...c)=>h('div',{cls},...c);
const Sp=(cls,t)=>h('span',{cls},t);
const Btn=(cls,t,fn,dis)=>h('button',{cls:'btn '+cls,onClick:fn,...(dis?{disabled:true}:{})},t);
const Inp=(cls,opts)=>h('input',{cls:'inp '+cls,...opts});
const Sel=(val,opts,fn,cls='')=>{const el=h('select',{cls:'sel '+cls});opts.forEach(o=>{const op=h('option',{value:o},o);if(o===val)op.selected=true;el.appendChild(op);});el.addEventListener('change',e=>fn(e.target.value));return el;};
const Fg=(lbl,el,sub)=>{const f=D('fg');f.appendChild(h('label',{cls:'fl'},lbl));f.appendChild(el);if(sub)f.appendChild(h('div',{style:'font-size:10px;color:#8a7260;margin-top:2px'},sub));return f;};
const Mr=(...bs)=>{const r=D('mr');bs.forEach(b=>r.appendChild(b));return r;};
const DivHdr=(t)=>{const d=D('');d.style.cssText='padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';d.appendChild(h('span',{style:'font-weight:700;font-size:13px'},t));return d;};
function metricTiles(items,compact=false){
  const grid=D('');
  grid.style.cssText=`display:grid;grid-template-columns:repeat(${items.length},minmax(0,1fr));gap:${compact?'4px':'6px'};margin-top:${compact?'6px':'8px'}`;
  items.forEach(it=>{
    const tile=D('');
    tile.style.cssText=`background:#faf6f1;border:1px solid #e2d9ce;border-radius:8px;padding:${compact?'5px 4px':'7px 6px'};min-width:0;text-align:center`;
    tile.appendChild(h('div',{style:`font-size:${compact?'7.5px':'8.5px'};color:#8a7260;font-weight:800;text-transform:uppercase;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`},it.label));
    tile.appendChild(h('div',{cls:'sf',style:`font-size:${compact?'10.5px':'13px'};color:${it.color||'#3a2818'};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`},it.value));
    grid.appendChild(tile);
  });
  return grid;
}
function Time12Control(value,onChange){
  const p=time12Parts(value),wrap=D('');
  wrap.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px';
  const hours=Array.from({length:12},(_,i)=>String(i+1));
  const mins=Array.from({length:12},(_,i)=>pad2(i*5));
  let hh=p.h,mm=p.mi,ap=p.ap;
  if(!mins.includes(mm))mins.push(mm),mins.sort();
  const hs=Sel(hh,hours,v=>{hh=v;onChange(time12To24(hh,mm,ap));});
  const ms=Sel(mm,mins,v=>{mm=v;onChange(time12To24(hh,mm,ap));});
  const as=Sel(ap,['AM','PM'],v=>{ap=v;onChange(time12To24(hh,mm,ap));});
  wrap.appendChild(hs);wrap.appendChild(ms);wrap.appendChild(as);
  return wrap;
}

// ─── SWIPE ROWS ──────────────────────────────────────────────
function closeSwipe(){if(openSw){const c=openSw.querySelector('.swc');if(c)c.style.transform='';openSw=null;}}
function swRow(content,onEdit,onDel){
  const wrap=D('sw');
  const acts=D('swa');
  if(onEdit){const eb=h('button',{cls:'sw-edit',onClick:(e)=>{e.stopPropagation();closeSwipe();onEdit();}});eb.innerHTML='✏️<span style="font-size:10px">Edit</span>';acts.appendChild(eb);}
  const db=h('button',{cls:'sw-del',onClick:(e)=>{e.stopPropagation();closeSwipe();onDel();}});db.innerHTML='🗑️<span style="font-size:10px">Delete</span>';acts.appendChild(db);
  const sc=D('swc');sc.appendChild(content);
  wrap.appendChild(acts);wrap.appendChild(sc);
  const AW=onEdit?124:62;
  let sx=0,sy=0,gk=false,ih=false;
  sc.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;gk=false;ih=false;sc.style.transition='none';},{passive:true});
  sc.addEventListener('touchmove',e=>{
    const dx=e.touches[0].clientX-sx,dy=e.touches[0].clientY-sy;
    if(!gk&&(Math.abs(dx)>4||Math.abs(dy)>4)){ih=Math.abs(dx)>Math.abs(dy);gk=true;}
    if(!ih)return;
    e.preventDefault();
    const isOpen=openSw===wrap;
    const base=isOpen?-AW:0;
    const off=Math.max(Math.min(base+dx,0),-AW);
    sc.style.transform=`translateX(${off}px)`;
    if(dx<0&&openSw&&openSw!==wrap)closeSwipe();
  },{passive:false});
  sc.addEventListener('touchend',e=>{
    if(!ih)return;
    sc.style.transition='transform .15s ease';
    const dx=e.changedTouches[0].clientX-sx;
    const isOpen=openSw===wrap;
    if(!isOpen&&dx<-40){sc.style.transform=`translateX(-${AW}px)`;openSw=wrap;}
    else if(isOpen&&dx>40){sc.style.transform='';openSw=null;}
    else if(!isOpen){sc.style.transform='';}
    else{sc.style.transform=`translateX(-${AW}px)`;}
  },{passive:true});
  return wrap;
}

// ─── COMPUTED ────────────────────────────────────────────────
function calc(){
  const data=S.data,now=new Date(),cm=curMk();
  const bTotal=data.bills.reduce((s,b)=>s+(b.monthlyAmounts[cm]||0),0);
  const bUnpaid=data.bills.filter(b=>!b.paid[cm]).reduce((s,b)=>s+(b.monthlyAmounts[cm]||0),0);
  const d7=new Date(now.getTime()-7*86400000);
  const meals=(data.transactions||[]).filter(t=>!isGroceryTx(t));
  const groceries=(data.transactions||[]).filter(isGroceryTx);
  const rec=meals.filter(t=>new Date(t.date)>=d7);
  const avgD=rec.length?rec.reduce((s,t)=>s+t.amount,0)/7:data.dailyBudget;
  const groceryMonth=groceries.filter(t=>mk(t.date)===cm).reduce((s,t)=>s+t.amount,0);
  const mBurn=bTotal+avgD*30;
  const runway=mBurn>0?Math.floor(data.balance/(mBurn/30)):9999;
  const todayS=meals.filter(t=>t.date===toStr()).reduce((s,t)=>s+t.amount,0);
  const chart=Array.from({length:7},(_,i)=>{const dd=new Date(now.getTime()-(6-i)*86400000),ds=dateOf(dd);return{label:chartLbl(dd),spend:meals.filter(t=>t.date===ds).reduce((s,t)=>s+t.amount,0),ds};});
  const maxS=Math.max(...chart.map(x=>x.spend),data.dailyBudget,1);
  return{bTotal,bUnpaid,avgD,mBurn,runway,todayS,groceryMonth,chart,maxS};
}
function pGroups(){
  const f=S.data.priceItems.filter(p=>S.pCat==='All'||p.category===S.pCat);
  const g=f.reduce((acc,item)=>{const key=item.name.toLowerCase().trim();if(!acc[key])acc[key]={display:item.name,items:[]};acc[key].items.push(item);return acc;},{});
  Object.values(g).forEach(x=>x.items.sort((a,b)=>a.price-b.price));
  return Object.values(g).sort((a,b)=>a.display.localeCompare(b.display));
}

// ─── SETUP ──────────────────────────────────────────────────
function renderSetup(){
  const wrap=D('setup');
  const logo=D('s-logo');logo.textContent='₱';
  const title=D('s-title');title.textContent='Budget Tracker';
  const sub=D('s-sub');sub.textContent='Enter your free Gemini API key to unlock AI price scanning.\nYour key is stored only on your device.';
  const card=D('s-card');
  card.appendChild(Object.assign(D('s-ct'),{textContent:'🔑 Gemini API Key (Free)'}));
  card.appendChild(Object.assign(D('s-cs'),{textContent:'Get a free key from Google AI Studio in about 2 minutes.'}));
  const steps=D('s-steps');
  [['1','Go to aistudio.google.com'],['2','Sign in with your Google account'],['3','Click "Get API key" → "Create API key"'],['4','Copy and paste the key below']].forEach(([n,t])=>{
    const row=D('s-step');const num=D('s-sn');num.textContent=n;const txt=D('s-st');
    if(n==='1')txt.innerHTML='Go to <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a>';
    else txt.textContent=t;row.appendChild(num);row.appendChild(txt);steps.appendChild(row);
  });
  card.appendChild(steps);
  if(S.setupErr){const err=D('s-err');err.textContent=S.setupErr;card.appendChild(err);}
  const iw=D('siw');
  const ki=h('input',{cls:'sinp',type:S.setupShow?'text':'password',placeholder:'Paste key here (AIza...)',value:S.setupInput,autocomplete:'off',autocorrect:'off',autocapitalize:'off'});
  ki.oninput=e=>{S.setupInput=e.target.value;};
  ki.addEventListener('keydown',e=>{if(e.key==='Enter')setupKey();});
  iw.appendChild(ki);iw.appendChild(h('button',{cls:'s-eye',type:'button',onClick:()=>set({setupShow:!S.setupShow})},S.setupShow?'🙈':'👁️'));
  card.appendChild(iw);
  card.appendChild(h('button',{cls:'s-btn',onClick:setupKey,...(S.setupLoading?{disabled:true}:{})},S.setupLoading?'⏳ Verifying...':'🚀 Start the App'));
  card.appendChild(Object.assign(D('s-note'),{innerHTML:'🔒 Stored only in your phone\'s browser storage.<br/>Not shared with anyone.'}));
  wrap.appendChild(logo);wrap.appendChild(title);wrap.appendChild(sub);wrap.appendChild(card);
  setTimeout(()=>{try{ki.focus();}catch{}},80);
  return wrap;
}

// ─── DRAWER ──────────────────────────────────────────────────
function renderDrawer(){
  const drawer=D('drawer'+(S.drawerOpen?' open':''));
  const dov=D('dov'+(S.drawerOpen?' show':''));
  dov.onclick=()=>set({drawerOpen:false});
  const dhdr=D('dr-hdr');dhdr.appendChild(Object.assign(D('dr-title'),{textContent:'Budget Tracker 🇵🇭'}));dhdr.appendChild(Object.assign(D('dr-sub'),{textContent:'Budget · Prices · Savings'}));drawer.appendChild(dhdr);
  const items=D('dr-items');
  const drItem=(icon,lbl,sub,fn,active)=>{
    const it=h('button',{cls:'dr-item'+(active?' dr-item-active':''),onClick:fn});
    it.appendChild(Object.assign(D('dr-item-icon'),{textContent:icon}));
    const tx=D('');tx.appendChild(Object.assign(D('dr-item-lbl'),{textContent:lbl}));if(sub)tx.appendChild(Object.assign(D('dr-item-sub'),{textContent:sub}));it.appendChild(tx);return it;
  };
  items.appendChild(drItem('🏠','Overview','Dashboard & balance',()=>set({tab:'dash',drawerOpen:false}),S.tab==='dash'));
  items.appendChild(drItem('🍽️','Food Expenses','Daily meal tracking',()=>set({tab:'food',drawerOpen:false}),S.tab==='food'));
  items.appendChild(drItem('🧴','Home & Toiletries','Household spending',()=>set({tab:'home',drawerOpen:false}),S.tab==='home'));
  items.appendChild(drItem('📋','Bills','Monthly bills tracker',()=>set({tab:'bills',drawerOpen:false}),S.tab==='bills'));
  items.appendChild(drItem('🏷️','Price Comparison','Track & compare prices',()=>set({tab:'prices',drawerOpen:false}),S.tab==='prices'));
  items.appendChild(drItem('📸','AI Scanner','Scan receipts & tags',()=>set({tab:'scan',drawerOpen:false}),S.tab==='scan'));
  items.appendChild(drItem('⚡','Electricity Usage','Appliances, aircon & TV',()=>set({tab:'aircon',drawerOpen:false}),S.tab==='aircon'));
  items.appendChild(drItem('🔌','Appliance Manager','Add, edit, delete appliances',()=>set({tab:'appliances',drawerOpen:false}),S.tab==='appliances'));
  items.appendChild(D('dr-sep'));
  items.appendChild(drItem('📊','Reports','Monthly spending breakdown',()=>set({tab:'reports',drawerOpen:false}),S.tab==='reports'));
  items.appendChild(drItem('📦','Pantry & Stocks','Track what you have at home',()=>set({tab:'stocks',drawerOpen:false}),S.tab==='stocks'));
  items.appendChild(D('dr-sep'));
  const exp=drItem('📤','Export Data','Save backup to file',exportData);items.appendChild(exp);
  const imp=drItem('📥','Import Data','Restore from backup',()=>{
    const fi=h('input',{type:'file',accept:'.json',onchange:importData});fi.click();
  });items.appendChild(imp);
  items.appendChild(D('dr-sep'));
  items.appendChild(drItem('⚙️','Settings','API keys & location',openSettings,false));
  drawer.appendChild(items);
  const frag=document.createDocumentFragment();frag.appendChild(dov);frag.appendChild(drawer);
  return frag;
}

// ─── DASHBOARD ──────────────────────────────────────────────
function renderDash(){
  const {bTotal,avgD,mBurn,runway,todayS,groceryMonth,chart,maxS}=calc();
  const eCycle=cycleForDate(new Date(),meralcoReadDay(S.data));
  const airconCost = (S.data.airconUsage || []).filter(u => inCycle(u,eCycle)).reduce((s, u) => s + u.cost, 0);
  const tvCost = (S.data.tvUsage || []).filter(u => inCycle(u,eCycle)).reduce((s, u) => s + u.cost, 0);
  const alwaysOnCost = (S.data.appliances || []).reduce((s, a) => s + applianceMonthly(a,S.data.meralcoRate).cost, 0);
  const applianceSessionCost = (S.data.applianceUsage || []).filter(u => inCycle(u,eCycle)).reduce((s, u) => s + u.cost, 0);
  const cycleAlwaysOnCost=alwaysOnCost/30*cycleDays(eCycle);
  const applianceCost = cycleAlwaysOnCost + applianceSessionCost;
  const data=S.data;
  const rwPct=Math.min((runway/365)*100,100);
  const rwCol=runway>120?'#6ce0a0':runway>60?'#f6d060':'#f07070';
  const sec=D('sec');
  // Balance hero
  const hero=D('card cg');const hcp=D('cp');
  const hrow=D('row');hrow.style.marginBottom='9px';
  const hl=D('');
  hl.appendChild(Object.assign(D('lblw'),{textContent:'Current Balance'}));
  const bv=D('sf');bv.style.cssText='font-size:33px;color:#fff;display:block;line-height:1.05;margin:2px 0';bv.textContent=fmt(data.balance);
  const bs=D('');bs.style.cssText='font-size:11px;color:rgba(255,255,255,.55);margin-top:2px';bs.textContent=`~${(runway/30).toFixed(1)} months · ${runway} days runway`;
  hl.appendChild(bv);hl.appendChild(bs);
  const eb=h('button',{cls:'btn bg',style:'color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.25);padding:5px 10px;font-size:11px',onClick:()=>set({balInput:String(data.balance),modal:'editBal'})},'Edit ✏️');
  hrow.appendChild(hl);hrow.appendChild(eb);hcp.appendChild(hrow);
  const rrow=D('row');rrow.style.marginBottom='4px';rrow.innerHTML=`<span style="font-size:10px;color:rgba(255,255,255,.45)">Runway vs 12 months</span><span style="font-size:10px;color:rgba(255,255,255,.45)">${(runway/30).toFixed(1)} / 12</span>`;
  const rb=D('rbar');const rf=D('rf');rf.style.cssText=`width:${rwPct}%;background:${rwCol}`;rb.appendChild(rf);
  hcp.appendChild(rrow);hcp.appendChild(rb);hero.appendChild(hcp);sec.appendChild(hero);
  // Stats
  const g2=D('g2');g2.style.marginBottom='9px';
  const ob=todayS>data.dailyBudget;
  const c1=D('card');c1.innerHTML=`<div class="cp"><div class="lbl">Today's Meals</div><div class="sf" style="font-size:23px;color:${ob?'#b83030':'#3a2818'};margin:2px 0">${fmt(todayS)}</div><div style="font-size:10.5px;color:#8a7260">Daily: ${fmt(data.dailyBudget)} · Monthly: ${fmt(data.dailyBudget*30)}</div>${ob?'<div style="font-size:10px;color:#b83030;font-weight:700;margin-top:1px">⚠️ Over budget</div>':''}</div>`;
  const c2=D('card');c2.innerHTML=`<div class="cp"><div class="lbl">Groceries This Month</div><div class="sf" style="font-size:23px;color:${groceryMonth>(data.groceryBudget||5000)?'#b83030':'#3a2818'};margin:2px 0">${fmt(groceryMonth)}</div><div style="font-size:10.5px;color:#8a7260">Monthly budget: ${fmt(data.groceryBudget||5000)}</div></div>`;
  g2.appendChild(c1);g2.appendChild(c2);sec.appendChild(g2);
  sec.appendChild(renderWeatherCard(data,{title:'Weather'}));
  const acCard = D('card');
  const acp=D('cp');
  acp.innerHTML = `<div class="lbl">Electricity Cycle · ${cycleLabel(eCycle)}</div><div class="sf" style="font-size:23px;margin:2px 0">${fmt2(airconCost+tvCost+applianceCost)}</div><div style="font-size:10.5px;color:#8a7260">24/7 ${fmt2(cycleAlwaysOnCost)} · Sessions ${fmt2(applianceSessionCost)} · Aircon ${fmt2(airconCost)} · TV ${fmt2(tvCost)}</div>`;
  acCard.appendChild(acp);sec.appendChild(acCard);
  const eActs=D('');eActs.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:9px';
  const eBtn=(label,fn,dis=false)=>{const b=Btn('bgfull',label,fn,dis);b.style.cssText='width:100%;padding:10px 4px;font-size:12px';return b;};
  eActs.appendChild(eBtn('+ Aircon',()=>{const mode=airconModeFrom(data.airconDefaultMode,data.airconDefaultSleepMode),w=data.weather||{};set({modal:'addAircon',airconF:{...timedSessionDraft(S.airconF,480),mode,sleepMode:mode==='sleep',tempC:data.airconDefaultTemp||S.airconF.tempC||'29',roomTemp:S.airconF.roomTemp||'',outdoorTemp:w.temp??S.airconF.outdoorTemp??'',outdoorFeels:w.apparent??S.airconF.outdoorFeels??'',outdoorHumidity:w.humidity??S.airconF.outdoorHumidity??''}});}));
  eActs.appendChild(eBtn('+ TV',()=>set({modal:'addTv',tvF:timedSessionDraft(S.tvF,180)})));
  eActs.appendChild(eBtn('+ Appliance',()=>{const first=(data.appliances||[]).find(a=>!a.alwaysOn);set({modal:'logAppliance',applianceSessionF:applianceSessionDraft(first)});},!(data.appliances||[]).some(a=>!a.alwaysOn)));
  sec.appendChild(eActs);
  sec.appendChild(renderCurrentlyOn(data));
  // 7-day chart
  const cc=D('card');cc.style.cursor='pointer';cc.onclick=()=>set({modal:'mealsMonthChart',chartMonthKey:curMk(),selectedMealDate:toStr()});const ccp=D('cp');ccp.style.paddingBottom='5px';
  const cr=D('row');cr.style.marginBottom='11px';cr.innerHTML=`<span class="lbl">7-Day Meals Spending</span><span style="font-size:11px;color:#8a7260">Avg ${fmt(Math.round(avgD))}/day</span>`;
  const bars=D('bw');
  chart.forEach(cd=>{
    const isT=cd.ds===toStr(),pct=cd.spend/maxS,over=cd.spend>data.dailyBudget&&cd.spend>0;
    const col=D('bc');
    const nl=D('');nl.style.cssText='font-size:7.5px;color:#8a7260;font-weight:600;text-align:center;height:12px';if(cd.spend>0)nl.textContent=Math.round(cd.spend);col.appendChild(nl);
    const bg=D('bbg');const fill=D('bf');fill.style.cssText=`height:${Math.max(pct*100,cd.spend>0?8:0)}%;background:${over?'#d45c5c':isT?'#1b4d35':'#2e6e4f'}`;bg.appendChild(fill);col.appendChild(bg);
    const lel=D('');lel.style.cssText=`font-size:7.5px;color:${isT?'#1b4d35':'#8a7260'};font-weight:${isT?800:400};text-align:center`;lel.textContent=cd.label;col.appendChild(lel);
    bars.appendChild(col);
  });
  ccp.appendChild(cr);ccp.appendChild(bars);ccp.appendChild(Object.assign(D(''),{style:'font-size:10px;color:#8a7260;margin-top:6px',textContent:'🟢 Within budget   🔴 Over budget'}));
  cc.appendChild(ccp);sec.appendChild(cc);
  const lb=Btn('bp bfull','+ Log Food / Expense',()=>set({modal:'addTx',txF:{...S.txF,date:toStr()}}));lb.style.marginBottom='4px';sec.appendChild(lb);
  const mealLogs=(data.transactions||[]).filter(isHomeCookedTx).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  if(mealLogs.length){
    const mc=D('card');mc.appendChild(Object.assign(D(''),{style:'padding:8px 13px;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Recent Meal Logs</span>'}));
    mealLogs.forEach(tx=>{
      const row=D('row cr');row.style.borderBottom='1px solid #e2d9ce';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:13px;font-weight:700;color:#3a2818;line-height:1.25'},`Home-cooked${tx.note?' · '+tx.note:''}`));
      const info=D('');info.style.cssText='font-size:10.5px;color:#8a7260;margin-top:2px;display:flex;align-items:center;gap:4px';
      info.appendChild(Sp('bdg bdg-f','Meal Log'));
      info.appendChild(document.createTextNode(' '+new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})));
      left.appendChild(info);
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px;flex-shrink:0';
      right.appendChild(h('button',{cls:'del',onClick:()=>delTx(tx.id)},'×'));
      row.appendChild(left);row.appendChild(right);mc.appendChild(row);
    });
    sec.appendChild(mc);
  }
  // Recent (Excluded Aircon and Home-cooked meal logs from recent deductions list)
  const paidFood=(data.transactions||[]).filter(t=>!isHomeCookedTx(t));
  const allTx=[...paidFood.slice(0,6).map(t=>({...t,type:'food'})),...(data.homeExpenses||[]).slice(0,4).map(t=>({...t,type:'home'}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(allTx.length){
    const rc=D('card');rc.appendChild(Object.assign(D(''),{style:'padding:8px 13px;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Recent Expenses</span>'}));
    allTx.forEach(tx=>{
      const row=D('row cr');row.style.cssText='border-bottom:1px solid #e2d9ce;align-items:flex-start;gap:8px';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      const nm=D('');nm.style.cssText='font-size:12.5px;font-weight:600';nm.textContent=tx.type==='food'?tx.source:tx.name;
      const info=D('');info.style.cssText='font-size:10.5px;color:#8a7260;margin-top:1px;display:flex;align-items:flex-start;gap:4px;line-height:1.35';
      const bcls=tx.type==='food'?'bdg-f':tx.type==='home'?'bdg-h':'bdg-a';
      info.appendChild(Sp('bdg '+bcls,tx.type==='food'?'Food':tx.type==='home'?'Home':'Aircon'));
      info.appendChild(h('span',{style:'min-width:0'},`${tx.note?tx.note+' · ':''}${new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`));
      left.appendChild(nm);left.appendChild(info);
      const right=D('');right.style.cssText='display:flex;align-items:center;justify-content:flex-end;gap:5px;flex:0 0 auto;min-width:82px;text-align:right;align-self:stretch';
      if(!(tx.type==='food'&&isHomeCookedTx(tx))){
        const amt=D('');amt.style.cssText=`font-weight:700;color:${tx.amount?'#b83030':'#8a7260'};font-size:13px;white-space:nowrap;text-align:right;line-height:1.25`;amt.textContent=tx.amount?'-'+fmt(tx.amount):fmt(0);
        right.appendChild(amt);
      }
      right.appendChild(h('button',{cls:'del',onClick:()=>tx.type==='food'?delTx(tx.id):delHome(tx.id)},'×'));
      row.appendChild(left);row.appendChild(right);rc.appendChild(row);
    });
    sec.appendChild(rc);
  }
  // Quick action buttons
  const qa=D('');qa.style.cssText='display:flex;gap:8px;margin-bottom:9px';
  const q1=Btn('bg bfull','🏠 Log Home',()=>set({modal:'addHome',homeF:{...S.homeF,date:toStr()}}));
  const q2=Btn('bg bfull','📊 Reports',()=>set({tab:'reports'}));
  qa.appendChild(q1);qa.appendChild(q2);sec.appendChild(qa);
  // Tips
  const tips=[['🥚','Eggs (₱8–10/pc) — cheapest complete protein. 3/day = ₱25 viand.'],['🐟','Galunggong / Sardines (₱25–50) — cheap, nutritious, easy to cook.'],['🫘','Monggo, Sitaw, Ampalaya (₱30–50/kg) — nutrient-dense vegetables.'],['🥬','Kangkong + Malunggay (₱10–20/bundle) — most nutritious green veg.'],['🍚','Sinangag + egg + leftovers = complete meal for ₱15–25.'],['🛒','Palengke is 20–40% cheaper than supermarket. Go before 9am.']];
  const tc=D('card');tc.style.marginBottom='18px';
  tc.appendChild(Object.assign(D(''),{style:'background:#faf6f1;padding:8px 13px;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">💡 Healthy Budget Tips</span>'}));
  const tcp=D('cp');tips.forEach(([ic,tx])=>{const r=D('tip-r');r.appendChild(h('span',{style:'font-size:15px'},ic));r.appendChild(h('span',{style:'font-size:11.5px;color:#3a2818;line-height:1.5'},tx));tcp.appendChild(r);});tc.appendChild(tcp);sec.appendChild(tc);
  return sec;
}

// ─── FOOD TAB ───────────────────────────────────────────────
function renderFood(){
  const data=S.data;
  const months=[...new Set(data.transactions.map(t=>mk(t.date)))].sort((a,b)=>b.localeCompare(a));
  if(months.length&&!months.includes(S.viewMk))S.viewMk=months[0];
  const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='11px';
  const mw=D('');mw.style.cssText='display:flex;align-items:center;gap:7px';
  mw.appendChild(h('span',{style:'font-size:11px;font-weight:700;color:#8a7260'},'Month:'));
  const allM=months.length?months:[curMk()];
  const msel=Sel(S.viewMk,allM,v=>set({viewMk:v}));
  msel.style.cssText='padding:5px 9px;font-size:12px;border-radius:7px;border:1.5px solid #e2d9ce;background:#fff';
  [...msel.options].forEach(o=>{o.text=mklbl(o.value);});
  mw.appendChild(msel);toprow.appendChild(mw);
  const fa=D('');fa.style.cssText='display:flex;gap:6px';
  if(S.multiFood){fa.appendChild(Btn('bgsm','Edit',()=>openBatchEdit('food'),!S.selFood.size));fa.appendChild(Btn('bgsm','Delete',()=>delSelected('food'),!S.selFood.size));fa.appendChild(Btn('bgsm','Done',()=>clearMulti('food')));}
  else {fa.appendChild(Btn('bgsm','Select',()=>set({multiFood:true,selFood:new Set()})));fa.appendChild(Btn('bgsm','📦 Pantry',()=>set({tab:'stocks'})));fa.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addTx',txF:{...S.txF,date:toStr()}})));}
  toprow.appendChild(fa);sec.appendChild(toprow);
  const mTx=data.transactions.filter(t=>mk(t.date)===S.viewMk);
  const homeCookedTx=mTx.filter(isHomeCookedTx),expenseTx=mTx.filter(t=>!isHomeCookedTx(t));
  const mealTx=expenseTx.filter(t=>!isGroceryTx(t)),groceryTx=expenseTx.filter(isGroceryTx);
  const mTotal=expenseTx.reduce((s,t)=>s+t.amount,0),mealTotal=mealTx.reduce((s,t)=>s+t.amount,0),groceryTotal=groceryTx.reduce((s,t)=>s+t.amount,0);
  const mDays=[...new Set(mealTx.map(t=>t.date))].length;
  const msc=D('card cg');msc.style.marginBottom='9px';msc.innerHTML=`<div class="cp"><div class="row" style="margin-bottom:9px"><div><div class="lblw">Food Spending — ${mklbl(S.viewMk)}</div><div class="sf" style="font-size:28px;color:#fff;margin:2px 0">${fmt(mTotal)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">${expenseTx.length} expense${expenseTx.length!==1?'s':''} · ${homeCookedTx.length} meal log${homeCookedTx.length!==1?'s':''}</div></div><div style="text-align:right"><div class="lblw">Meal Avg/Day</div><div class="sf" style="font-size:20px;color:#fff;margin-top:3px">${fmt(mDays?Math.round(mealTotal/mDays):0)}</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:7px"><div class="lblw">Meals</div><div class="sf" style="font-size:16px;color:#fff">${fmt(mealTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:7px"><div class="lblw">Groceries</div><div class="sf" style="font-size:16px;color:${groceryTotal>(data.groceryBudget||5000)?'#ffd07a':'#fff'}">${fmt(groceryTotal)}</div><div style="font-size:9.5px;color:rgba(255,255,255,.55)">Budget ${fmt(data.groceryBudget||5000)}</div></div></div></div>`;
  sec.appendChild(msc);
  if(!mTx.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">🍽️</div><div>No food expenses logged for this month.</div>';sec.appendChild(e);return sec;}
  if(homeCookedTx.length){
    const mc=D('card');mc.appendChild(DivHdr('Meal Logs'));
    homeCookedTx.sort((a,b)=>b.date.localeCompare(a.date)).forEach(tx=>{
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;justify-content:flex-start;gap:9px';
      if(S.multiFood)inner.appendChild(h('input',{type:'checkbox',checked:S.selFood.has(tx.id),style:'width:18px;height:18px;flex:0 0 18px',onClick:e=>{e.stopPropagation();toggleSel('food',tx.id);}}));
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:13px;font-weight:700;color:#3a2818;line-height:1.25'},`Home-cooked${tx.note?' · '+tx.note:''}`));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;margin-top:2px'},new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})));
      inner.appendChild(left);
      mc.appendChild(S.multiFood?inner:swRow(inner,()=>openEdit('food',tx.id),()=>delTx(tx.id)));
    });
    sec.appendChild(mc);
  }
  const grouped=expenseTx.reduce((acc,tx)=>{if(!acc[tx.date])acc[tx.date]=[];acc[tx.date].push(tx);return acc;},{});
  Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).forEach(ds=>{
    const txs=grouped[ds],total=txs.reduce((s,t)=>s+t.amount,0),mealTotal=txs.filter(t=>!isGroceryTx(t)).reduce((s,t)=>s+t.amount,0),groceryTotal=txs.filter(isGroceryTx).reduce((s,t)=>s+t.amount,0),over=mealTotal>data.dailyBudget;
    const card=D('card');
    const hdr=D('row');hdr.style.cssText='padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
    hdr.appendChild(h('span',{style:'font-weight:700;font-size:12.5px'},new Date(ds+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})));
    hdr.appendChild(h('span',{cls:'sf',style:`font-size:16px;color:${over?'#b83030':'#2e6e4f'}`},`${fmt(mealTotal)} meals${groceryTotal?' · '+fmt(groceryTotal)+' grocery':''}${over?' ⚠️':''}`));
    card.appendChild(hdr);
    txs.forEach(tx=>{
      const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
      inner.style.justifyContent='flex-start';inner.style.gap='9px';
      if(S.multiFood)inner.appendChild(h('input',{type:'checkbox',checked:S.selFood.has(tx.id),style:'width:18px;height:18px;flex:0 0 18px',onClick:e=>{e.stopPropagation();toggleSel('food',tx.id);}}));
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:12px;font-weight:600'},tx.source));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${tx.note?tx.note+' · ':''}${tx.discount?`Discount ${fmt(tx.discount)} · `:''}${new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`));
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px;flex-shrink:0';
      right.appendChild(h('span',{style:'font-weight:700;font-size:13px'},fmt(tx.amount)));
      const row=S.multiFood?inner:swRow(inner,()=>openEdit('food',tx.id),()=>delTx(tx.id));
      inner.appendChild(left);
      inner.appendChild(right);
      card.appendChild(row);
    });
    const foot=D('');foot.style.cssText='padding:5px 13px;display:flex;justify-content:flex-end';
    foot.appendChild(h('span',{style:`font-size:10.5px;color:${over?'#b83030':'#8a7260'}`},over?`Meals ₱${(mealTotal-data.dailyBudget).toFixed(0)} over budget`:`Meals ₱${(data.dailyBudget-mealTotal).toFixed(0)} remaining`));
    card.appendChild(foot);
    sec.appendChild(card);
  });
  return sec;
}

// ─── HOME TAB ───────────────────────────────────────────────
function renderHome(){
  const data=S.data,expenses=data.homeExpenses||[];
  const months=[...new Set(expenses.map(e=>mk(e.date)))].sort((a,b)=>b.localeCompare(a));
  if(months.length&&!months.includes(S.viewMk))S.viewMk=months[0];
  const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='11px';
  const mw=D('');mw.style.cssText='display:flex;align-items:center;gap:7px';
  mw.appendChild(h('span',{style:'font-size:11px;font-weight:700;color:#8a7260'},'Month:'));
  const allM=months.length?months:[curMk()];
  const msel=Sel(S.viewMk,allM,v=>set({viewMk:v}));
  msel.style.cssText='padding:5px 9px;font-size:12px;border-radius:7px;border:1.5px solid #e2d9ce;background:#fff';
  [...msel.options].forEach(o=>{o.text=mklbl(o.value);});
  mw.appendChild(msel);toprow.appendChild(mw);
  const ha=D('');ha.style.cssText='display:flex;gap:6px';
  if(S.multiHome){ha.appendChild(Btn('bgsm','Edit',()=>openBatchEdit('home'),!S.selHome.size));ha.appendChild(Btn('bgsm','Delete',()=>delSelected('home'),!S.selHome.size));ha.appendChild(Btn('bgsm','Done',()=>clearMulti('home')));}
  else {ha.appendChild(Btn('bgsm','Select',()=>set({multiHome:true,selHome:new Set()})));ha.appendChild(Btn('bgsm','📦 Stocks',()=>set({tab:'stocks'})));ha.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addHome',homeF:{...S.homeF,date:toStr()}})));}
  toprow.appendChild(ha);sec.appendChild(toprow);
  const chips=D('chips');['All',...homeCategories()].forEach(cat=>{const c=D('chip'+(S.homeCat===cat?' chip-on':''));c.textContent=cat;c.onclick=()=>set({homeCat:cat});chips.appendChild(c);});sec.appendChild(chips);
  const mExp=expenses.filter(e=>mk(e.date)===S.viewMk);
  const mTotal=mExp.reduce((s,e)=>s+e.amount,0);
  const msc=D('card cg');msc.style.marginBottom='9px';msc.innerHTML=`<div class="cp"><div class="lblw">Home & Toiletries — ${mklbl(S.viewMk)}</div><div class="sf" style="font-size:28px;color:#fff;margin:2px 0">${fmt(mTotal)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">${mExp.length} item${mExp.length!==1?'s':''}</div></div>`;
  sec.appendChild(msc);
  const filtered=mExp.filter(e=>S.homeCat==='All'||e.category===S.homeCat);
  if(!filtered.length){const e=D('card empty');e.innerHTML=`<div style="font-size:34px;margin-bottom:7px">🧴</div><div>No home expenses${S.homeCat!=='All'?' for '+S.homeCat:''} this month.</div>`;sec.appendChild(e);return sec;}
  const byCat=filtered.reduce((acc,e)=>{if(!acc[e.category])acc[e.category]=[];acc[e.category].push(e);return acc;},{});
  Object.entries(byCat).sort().forEach(([cat,items])=>{
    const total=items.reduce((s,e)=>s+e.amount,0);
    const card=D('card');const hdr=D('row');hdr.style.cssText='padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
    hdr.appendChild(h('span',{style:'font-weight:700;font-size:13px'},cat));
    hdr.appendChild(h('span',{cls:'sf',style:'font-size:16px;color:#1a56c4'},fmt(total)));
    card.appendChild(hdr);
    items.sort((a,b)=>b.date.localeCompare(a.date)).forEach(item=>{
      const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
      inner.style.justifyContent='flex-start';inner.style.gap='9px';
      if(S.multiHome)inner.appendChild(h('input',{type:'checkbox',checked:S.selHome.has(item.id),style:'width:18px;height:18px;flex:0 0 18px',onClick:e=>{e.stopPropagation();toggleSel('home',item.id);}}));
      const left=D('');left.style.cssText='flex:1;min-width:0';
      const nm=D('');nm.style.cssText='font-size:12px;font-weight:600';nm.textContent=item.name;
      const ns=D('');ns.style.cssText='font-size:10.5px;color:#8a7260';ns.textContent=item.store+(item.note?' · '+item.note:'')+(item.discount?' · Discount '+fmt(item.discount):'')+' · '+new Date(item.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'});
      const qty=parseFloat(item.qty)||1,unitPrice=parseFloat(item.unitPrice)||item.amount;
      if(qty>1)ns.textContent+=` · ${qty} x ${fmt(unitPrice)}`;
      left.appendChild(nm);left.appendChild(ns);
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px;flex-shrink:0';
      right.appendChild(h('span',{style:'font-weight:700;font-size:13px'},fmt(item.amount)));
      inner.appendChild(left);inner.appendChild(right);
      card.appendChild(S.multiHome?inner:swRow(inner,()=>openEdit('home',item.id),()=>delHome(item.id)));
    });
    sec.appendChild(card);
  });
  return sec;
}

// ─── PRICES TAB ──────────────────────────────────────────────
function renderPrices(){
  const groups=pGroups();const sec=D('sec');
  const srow=D('row');srow.style.marginBottom='8px';
  const applySearch=v=>{
    S.pSearch=v;
    const q=v.toLowerCase();
    sec.querySelectorAll('[data-price-group]').forEach(el=>{el.style.display=el.dataset.priceGroup.includes(q)?'':'none';});
  };
  const si=Inp('',{type:'text',placeholder:'🔍 Search item...',value:S.pSearch});si.style.flex='1';si.oninput=e=>applySearch(e.target.value);
  srow.appendChild(si);srow.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addPrice'})));sec.appendChild(srow);
  const chips=D('chips');['All','Food','Home & Toiletries'].forEach(cat=>{const c=D('chip'+(S.pCat===cat?' chip-on':''));c.textContent=cat;c.onclick=()=>set({pCat:cat});chips.appendChild(c);});sec.appendChild(chips);
  if(!groups.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">🏷️</div><div>No prices tracked yet.<br/>Add items or use AI Scan!</div>';sec.appendChild(e);return sec;}
  groups.forEach(group=>{
    const card=D('card');card.dataset.priceGroup=group.display.toLowerCase();if(S.pSearch&&!card.dataset.priceGroup.includes(S.pSearch.toLowerCase()))card.style.display='none';const hdr=D('');hdr.style.cssText='padding:7px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
    const hn=D('');hn.style.cssText='font-weight:700;font-size:13px;text-transform:capitalize';hn.textContent=group.display;hdr.appendChild(hn);
    if(group.items.length>1){const gs=D('');gs.style.cssText='font-size:10.5px;color:#2e6e4f;font-weight:700;margin-top:1px';gs.textContent=`Save ${fmt(group.items[group.items.length-1].price-group.items[0].price)} by choosing cheapest`;hdr.appendChild(gs);}
    card.appendChild(hdr);
    group.items.forEach((item,idx)=>{
      const inner=D('row cr');inner.style.cssText=`border-bottom:1px solid #e2d9ce;background:${idx===0?'#edf8f2':'#fff'}`;
      const left=D('');
      if(idx===0){const t=D('');t.style.marginBottom='2px';t.appendChild(Sp('tag-c','CHEAPEST'));left.appendChild(t);}
      const st=D('');st.style.cssText='font-size:12px;color:#8a7260';st.textContent=item.store;
      const ut=D('');ut.style.cssText='font-size:10px;color:#8a7260';ut.textContent=item.unit+(item.subcat?' · '+item.subcat:'');
      left.appendChild(st);left.appendChild(ut);
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:7px';
      right.appendChild(h('span',{cls:'sf',style:`font-size:18px;color:${idx===0?'#2e6e4f':'#3a2818'}`},fmt(item.price)));
      inner.appendChild(left);inner.appendChild(right);
      card.appendChild(swRow(inner,()=>openEdit('price',item.id),()=>delPrice(item.id)));
    });
    sec.appendChild(card);
  });
  return sec;
}

// ─── SCAN TAB ───────────────────────────────────────────────
function renderScan(){
  const sec=D('sec');const card=D('card');const cp=D('cp');
  cp.appendChild(h('span',{cls:'sf',style:'font-size:17px;display:block;margin-bottom:4px'},'📸 AI Scan'));
  cp.appendChild(h('p',{style:'font-size:12px;color:#8a7260;line-height:1.6;margin-bottom:12px'},'Upload a receipt, order screenshot, price tag, menu, or market sign. Save results to food expenses, home expenses, or price comparison.'));
  if(S.geminiKey){
    cp.appendChild(Object.assign(D('qtip'),{innerHTML:'<strong>⚡ Gemini Limits:</strong> Usage is counted per Google Cloud project and per model. The app tries Flash-Lite first, then Flash fallbacks. If quota is reached, wait for the retry time or check AI Studio rate limits.'}));
    const ok=D('row');ok.style.cssText='background:#e6f3ec;border-radius:8px;padding:6px 11px;margin-bottom:11px';
    ok.appendChild(h('span',{style:'font-size:11px;color:#2e6e4f;font-weight:700'},'✅ Gemini Active'));
    ok.appendChild(h('button',{style:'font-size:10.5px;color:#8a7260;background:none;border:none;cursor:pointer',onClick:openSettings},'Settings'));
    cp.appendChild(ok);
  }else{
    const notice=D('qtip');
    notice.innerHTML='<strong>AI Scan needs a Gemini API key.</strong> The rest of the app works without it. Add your key in Settings when you want receipt and price scanning.';
    cp.appendChild(notice);
    const sb=Btn('bgfull','Open Settings',openSettings);sb.style.marginBottom='11px';cp.appendChild(sb);
  }
  const fi=h('input',{type:'file',accept:'image/*',style:'display:none'});
  fi.onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    set({scanData:null,scanErr:'Optimizing...',addedIdx:new Set()});
    try{const url=await resizeImage(file);set({scanImg:url.split(',')[1],scanMime:url.split(';')[0].split(':')[1],scanErr:''});}
    catch(err){set({scanErr:'Image error: '+err.message});}
  };
  cp.appendChild(fi);
  if(!S.scanImg){cp.appendChild(Btn('bp bfull','📷 Choose Photo / Take a Picture',()=>fi.click()));}
  else{
    cp.appendChild(h('img',{src:`data:${S.scanMime};base64,${S.scanImg}`,cls:'si'}));
    const br=D('');br.style.cssText='display:flex;gap:7px';
    const sb=Btn('ba','🔍 '+(S.scanning?'Analyzing...':'Scan Prices'),doScan,S.scanning||!S.geminiKey);sb.style.cssText='flex:1;padding:11px';
    br.appendChild(sb);br.appendChild(Btn('bgsm','✕',()=>set({scanImg:null,scanData:null,scanErr:'',addedIdx:new Set()})));
    cp.appendChild(br);
  }
  card.appendChild(cp);sec.appendChild(card);
  if(S.scanErr){const err=D('aerr');err.textContent=S.scanErr;sec.appendChild(err);}
  if(S.scanData!==null){
    const rc=D('card');rc.appendChild(Object.assign(D(''),{style:'padding:7px 13px;border-bottom:1px solid #e2d9ce',innerHTML:`<span class="lbl">Extracted: ${S.scanData.length} item${S.scanData.length!==1?'s':''}</span>`}));
    if(!S.scanData.length)rc.appendChild(Object.assign(D('cp muted'),{style:'text-align:center',textContent:'No prices found. Try a clearer photo.'}));
    else S.scanData.forEach((item,idx)=>{
      const qty=scanQty(item),total=scanTotal(item);
      const row=D('cr');row.style.cssText='border-bottom:1px solid #e2d9ce;padding:10px 13px';
      const left=D('');left.style.flex='1';
      left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700;text-transform:capitalize'},item.name));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${item.store||'Unknown'} · ${item.unit||'pcs'} · ${item.subcat||item.category}${qty>1?' · x'+qty:''}`));
      const priceBox=D('');priceBox.style.cssText='text-align:right;flex-shrink:0';
      priceBox.appendChild(h('div',{cls:'sf',style:'font-size:16px'},fmt(total)));
      if(qty>1)priceBox.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},`${qty} x ${fmt(item.price)}`));
      const top=D('row');top.appendChild(left);top.appendChild(priceBox);
      const acts=D('');acts.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px';
      [['food','Food'],['home','Home'],['price','Price']].forEach(([dest,label])=>{
        const added=S.addedIdx.has(`${idx}:${dest}`);
        acts.appendChild(Btn(added?'bgsm':'bsm',added?'✓ '+label:'+ '+label,()=>addScanned(item,idx,dest),added));
      });
      row.appendChild(top);row.appendChild(acts);rc.appendChild(row);
    });
    sec.appendChild(rc);
  }
  return sec;
}

// ─── BILLS TAB ──────────────────────────────────────────────
function renderBills(){
  const data=S.data,bm=S.billsMk;const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='10px';
  const mw=D('');mw.style.cssText='display:flex;align-items:center;gap:7px';
  mw.appendChild(h('span',{style:'font-size:11px;font-weight:700;color:#8a7260'},'Month:'));
  const allM=Array.from({length:7},(_,i)=>{const d2=new Date();d2.setMonth(d2.getMonth()-3+i);return mk(dateOf(d2));});
  const msel=Sel(bm,allM,v=>set({billsMk:v}));
  msel.style.cssText='padding:5px 9px;font-size:12px;border-radius:7px;border:1.5px solid #e2d9ce;background:#fff';
  [...msel.options].forEach(o=>{o.text=mklbl(o.value);});
  mw.appendChild(msel);toprow.appendChild(mw);toprow.appendChild(Btn('bp bsm','+ Bill',()=>set({modal:'addBill'})));sec.appendChild(toprow);
  const mTotal=data.bills.reduce((s,b)=>s+(b.monthlyAmounts[bm]||0),0);
  const mUnpaid=data.bills.filter(b=>!b.paid[bm]).reduce((s,b)=>s+(b.monthlyAmounts[bm]||0),0);
  const hero=D('card cg');hero.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr"><div style="padding:12px 13px;border-right:1px solid rgba(255,255,255,.15)"><div class="lblw">${mklbl(bm)} Bills</div><div class="sf" style="font-size:24px;color:#fff;margin-top:2px">${fmt(mTotal)}</div></div><div style="padding:12px 13px"><div class="lblw">Unpaid</div><div class="sf" style="font-size:24px;color:${mUnpaid>0?'#ffd07a':'#7fe0b0'};margin-top:2px">${fmt(mUnpaid)}</div></div></div>`;
  sec.appendChild(hero);
  sec.appendChild(h('p',{style:'font-size:11.5px;color:#8a7260;margin-bottom:9px;padding:0 2px;line-height:1.5'},`Enter the amount for each bill this month — amounts can change every month.`));
  data.bills.forEach(bill=>{
    const amount=bill.monthlyAmounts[bm]||0;const paid=!!bill.paid[bm];
    const isElectric=String(bill.name||'').toLowerCase().includes('electric');
    const kwh=isElectric?(parseFloat(bill.monthlyKwh?.[bm])||0):0;
    const cmp=isElectric&&kwh?electricityComparisonForMonth(bm,data,kwh):null;
    const billCycle=cmp?.cycle||null;
    const dailyKwh=kwh&&billCycle?kwh/cycleDays(billCycle):0;
    const est=cmp?.est||null;
    const diff=est?est.totalKwh-kwh:0;
    const logsPct=est&&kwh?est.totalKwh/kwh*100:0;
    const card=D('card');
    const hdr=D('row');hdr.style.cssText='padding:9px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
    hdr.appendChild(h('span',{style:'font-weight:700;font-size:13px'},bill.name));
    hdr.appendChild(h('button',{cls:'del',onClick:()=>delBill(bill.id)},'×'));
    card.appendChild(hdr);
    // Amount input — NO re-render on keypress, only on blur
    const ar=D('row cp');ar.style.borderBottom='1px solid #e2d9ce';
    ar.appendChild(h('span',{style:'font-size:11.5px;color:#8a7260'},`Amount for ${mklbl(bm)}:`));
    const inputKey=bill.id+'_'+bm;
    const ai=h('input',{type:'number',inputmode:'decimal',placeholder:'0',style:'width:110px;padding:7px 9px;border-radius:7px;border:1.5px solid #e2d9ce;font-size:14px;font-weight:600;color:#3a2818;text-align:right;font-family:inherit'});
    ai.value=S.billDraft[inputKey]!==undefined?S.billDraft[inputKey]:(amount||'');
    ai.addEventListener('input',e=>{S.billDraft[inputKey]=e.target.value;});  // NO render
    ai.addEventListener('blur',e=>{delete S.billDraft[inputKey];setBillAmt(bill.id,bm,e.target.value);});
    ar.appendChild(ai);card.appendChild(ar);
    if(isElectric){
      const kr=D('row cp');kr.style.borderBottom='1px solid #e2d9ce';
      const left=D('');
      left.appendChild(h('div',{style:'font-size:11.5px;color:#8a7260'},'Meralco kWh used:'));
      if(kwh){
        const meta=D('');
        meta.style.cssText='margin-top:5px;background:#faf6f1;border:1px solid #e2d9ce;border-radius:8px;padding:6px 8px';
        meta.appendChild(h('div',{cls:'sf',style:'font-size:14px;color:#3a2818;line-height:1'},`${kwh.toFixed(2)} kWh`));
        meta.appendChild(h('div',{style:'font-size:9.5px;color:#8a7260;margin-top:3px;line-height:1.35'},`${cycleLabel(billCycle)} · ${dailyKwh.toFixed(2)} kWh/day`));
        left.appendChild(meta);
      }
      kr.appendChild(left);
      const kKey=bill.id+'_'+bm+'_kwh';
      const ki=h('input',{type:'number',inputmode:'decimal',placeholder:'e.g. 157',style:'width:110px;padding:7px 9px;border-radius:7px;border:1.5px solid #e2d9ce;font-size:14px;font-weight:600;color:#3a2818;text-align:right;font-family:inherit'});
      ki.value=S.billDraft[kKey]!==undefined?S.billDraft[kKey]:(kwh||'');
      ki.addEventListener('input',e=>{S.billDraft[kKey]=e.target.value;});
      ki.addEventListener('blur',e=>{delete S.billDraft[kKey];setBillKwh(bill.id,bm,e.target.value);});
      kr.appendChild(ki);card.appendChild(kr);
      if(est){
        const cmp=D('cp');cmp.style.cssText='padding-top:0;border-bottom:1px solid #e2d9ce';
        cmp.appendChild(metricTiles([
          {label:'Estimate',value:`${est.totalKwh.toFixed(2)} kWh`},
          {label:'Diff',value:`${diff>=0?'+':''}${diff.toFixed(2)} kWh`,color:Math.abs(diff)>kwh*.2?'#b8720c':'#2e6e4f'},
          {label:'Logs',value:`${logsPct.toFixed(1)}%`,color:logsPct>=80?'#2e6e4f':'#b8720c'}
        ],true));
        card.appendChild(cmp);
      }
    }
    // Paid toggle
    const pr=D('row cp');pr.style.alignItems='center';
    const pb=Btn(paid?'bgsm':'bp',paid?'✓ Paid':'Mark Paid',()=>toggleBillPaid(bill.id,bm));
    pb.style.fontSize='12px';
    pr.appendChild(pb);
    pr.appendChild(h('span',{cls:'sf',style:`font-size:18px;color:${paid?'#8a7260':'#3a2818'}`},amount?fmt(amount):'₱—'));
    card.appendChild(pr);sec.appendChild(card);
  });
  sec.appendChild(h('button',{cls:'bgfull',style:'margin-bottom:18px',onClick:()=>set({modal:'addBill'})},'+ Add a Bill'));
  return sec;
}

// ─── REPORTS TAB ─────────────────────────────────────────────
function renderReports(){
  const data=S.data,rm=S.rptMk;const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='11px';
  const mw=D('');mw.style.cssText='display:flex;align-items:center;gap:7px';
  mw.appendChild(h('span',{style:'font-size:11px;font-weight:700;color:#8a7260'},'Month:'));
  const billMonths=(data.bills||[]).flatMap(b=>[...Object.keys(b.monthlyAmounts||{}),...Object.keys(b.monthlyKwh||{})]);
  const allMonths=[...new Set([...(data.transactions||[]).map(t=>mk(t.date)),...(data.homeExpenses||[]).map(e=>mk(e.date)),...(data.airconUsage||[]).map(e=>mk(e.date)),...(data.tvUsage||[]).map(e=>mk(e.date)),...(data.applianceUsage||[]).map(e=>mk(e.date)),...billMonths,...Array.from({length:3},(_,i)=>{const d2=new Date();d2.setMonth(d2.getMonth()-i);return mk(dateOf(d2));})])].sort((a,b)=>b.localeCompare(a));
  const msel=Sel(rm,allMonths,v=>set({rptMk:v}));
  msel.style.cssText='padding:5px 9px;font-size:12px;border-radius:7px;border:1.5px solid #e2d9ce;background:#fff';
  [...msel.options].forEach(o=>{o.text=mklbl(o.value);});
  mw.appendChild(msel);toprow.appendChild(mw);sec.appendChild(toprow);
  // Totals
  const foodTx=(data.transactions||[]).filter(t=>mk(t.date)===rm);
  const homeEx=(data.homeExpenses||[]).filter(e=>mk(e.date)===rm);
  const airconUsage=(data.airconUsage||[]).filter(u=>mk(u.date)===rm);
  const tvUsage=(data.tvUsage||[]).filter(u=>mk(u.date)===rm);
  const appliances=data.appliances||[],applianceUsage=(data.applianceUsage||[]).filter(u=>mk(u.date)===rm);
  const billsTotal=data.bills.reduce((s,b)=>s+(b.monthlyAmounts[rm]||0),0);
  const foodTotal=foodTx.reduce((s,t)=>s+t.amount,0);
  const homeTotal=homeEx.reduce((s,e)=>s+e.amount,0);
  const electricReport=electricityReportForMonth(rm,data);
  const airconTotal=electricReport.airconCost;
  const tvTotal=electricReport.tvCost;
  const applianceTotal=electricReport.sessionCost+electricReport.alwaysCost;
  const electricityTotal=electricReport.totalCost;
  const grandTotal=foodTotal+homeTotal+billsTotal; // Exclude aircon as it's part of the bills
  // Hero card
  const hero=D('card cg');hero.style.marginBottom='9px';
  hero.innerHTML=`<div class="cp"><div class="row" style="margin-bottom:10px"><div><div class="lblw">Total Spending — ${mklbl(rm)}</div><div class="sf" style="font-size:32px;color:#fff;margin:2px 0">${fmt(grandTotal)}</div></div></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Food</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(foodTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Home</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(homeTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Bills</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(billsTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Electric</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(electricityTotal)}</div></div></div></div>`;
  const foodTile=hero.querySelector('.cp > div:nth-child(2) > div:nth-child(1)');
  const homeTile=hero.querySelector('.cp > div:nth-child(2) > div:nth-child(2)');
  const electricTile=hero.querySelector('.cp > div:nth-child(2) > div:nth-child(4)');
  if(foodTile){foodTile.style.cursor='pointer';foodTile.onclick=()=>set({modal:'foodReport',chartMonthKey:rm});}
  if(homeTile){homeTile.style.cursor='pointer';homeTile.onclick=()=>set({modal:'homeReport',chartMonthKey:rm});}
  if(electricTile){electricTile.style.cursor='pointer';electricTile.onclick=()=>set({modal:'electricityReport',chartMonthKey:rm});}
  sec.appendChild(hero);
  // Category breakdown
  const catData={};
  foodTx.filter(t=>!isHomeCookedTx(t)).forEach(t=>{const key=t.source;if(!catData[key])catData[key]={amount:0,type:'food'};catData[key].amount+=t.amount;});
  homeEx.forEach(e=>{const key=e.category;if(!catData[key])catData[key]={amount:0,type:'home'};catData[key].amount+=e.amount;});
  if(billsTotal>0)catData['Bills']={amount:billsTotal,type:'bill'};
  if(electricityTotal>0)catData['Electricity']={amount:electricityTotal,type:'aircon'};
  const sortedCats=Object.entries(catData).sort((a,b)=>b[1].amount-a[1].amount);
  const maxCat=sortedCats.length?sortedCats[0][1].amount:1;
  if(sortedCats.length){
    const bcard=D('card');bcard.style.marginBottom='9px';
    bcard.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Breakdown by Category</span>'}));
    const bcp=D('cp');
    const colors={'food':'#2e6e4f','home':'#1a56c4','bill':'#b8720c','aircon':'#e65100'};
    sortedCats.forEach(([cat,{amount,type}])=>{
      const row=D('rpt-bar-row');
      const lbl=D('rpt-bar-label');lbl.textContent=cat;
      const track=D('rpt-bar-track');
      const fill=D('rpt-bar-fill');fill.style.cssText=`width:${(amount/maxCat*100).toFixed(1)}%;background:${colors[type]||'#8a7260'}`;
      track.appendChild(fill);
      const val=D('rpt-bar-val');val.textContent=fmt(amount);
      const pct=D('');pct.style.cssText='font-size:10px;color:#8a7260;width:35px;text-align:right;flex-shrink:0';
      pct.textContent=grandTotal?`${(amount/grandTotal*100).toFixed(0)}%`:'';
      row.appendChild(lbl);row.appendChild(track);row.appendChild(val);row.appendChild(pct);bcp.appendChild(row);
    });
    bcard.appendChild(bcp);sec.appendChild(bcard);
  }
  // Daily spending chart for the month
  const paidFoodTx=foodTx.filter(t=>!isHomeCookedTx(t));
  if(paidFoodTx.length){
    const dc=D('card');dc.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Food Spending by Source</span>'}));
    const dcp=D('cp');
    const bySrc=paidFoodTx.reduce((acc,t)=>{if(!acc[t.source])acc[t.source]=0;acc[t.source]+=t.amount;return acc;},{});
    const maxSrc=Math.max(...Object.values(bySrc),1);
    Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).forEach(([src,amt])=>{
      const row=D('rpt-bar-row');
      const lbl=D('rpt-bar-label');lbl.textContent=src;
      const track=D('rpt-bar-track');const fill=D('rpt-bar-fill');fill.style.cssText=`width:${(amt/maxSrc*100).toFixed(1)}%;background:#2e6e4f`;track.appendChild(fill);
      const val=D('rpt-bar-val');val.textContent=fmt(amt);
      row.appendChild(lbl);row.appendChild(track);row.appendChild(val);dcp.appendChild(row);
    });
    dc.appendChild(dcp);sec.appendChild(dc);
  }
  const eBill=electricityBill(data),actualKwh=parseFloat(eBill?.monthlyKwh?.[rm])||0;
  if(actualKwh){
    const cmp=electricityComparisonForMonth(rm,data,actualKwh),eCycle=cmp.cycle,est=cmp.est;
    const diff=est.totalKwh-actualKwh,logsPct=actualKwh?est.totalKwh/actualKwh*100:0,amount=parseFloat(eBill?.monthlyAmounts?.[rm])||0,eff=amount?amount/actualKwh:0,untracked=Math.max(0,actualKwh-est.totalKwh);
    const ec=D('card');ec.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Electricity Bill Comparison</span>'}));
    const ep=D('cp');
    const actualBox=D('');
    actualBox.style.cssText='background:#f7f3ee;border:1px solid #e2d9ce;border-radius:8px;padding:8px 10px;margin-bottom:8px';
    actualBox.appendChild(h('div',{cls:'lbl',style:'margin-bottom:2px'},'Meralco Actual'));
    actualBox.appendChild(h('div',{cls:'sf',style:'font-size:22px;color:#3a2818;line-height:1.05'},`${actualKwh.toFixed(2)} kWh`));
    actualBox.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;margin-top:4px'},`${cycleLabel(eCycle)} · ${(actualKwh/cycleDays(eCycle)).toFixed(2)} kWh/day`));
    ep.appendChild(actualBox);
    const tiles=[
      {label:'Estimate',value:`${est.totalKwh.toFixed(2)} kWh`},
      {label:'Diff',value:`${diff>=0?'+':''}${diff.toFixed(2)} kWh`,color:Math.abs(diff)>actualKwh*.2?'#b8720c':'#2e6e4f'},
      {label:'Logs',value:`${logsPct.toFixed(1)}%`,color:logsPct>=80?'#2e6e4f':'#b8720c'}
    ];
    if(eff)tiles.push({label:'Rate',value:`${fmt2(eff)}/kWh`});
    ep.appendChild(metricTiles(tiles));
    ep.appendChild(h('div',{cls:'lbl',style:'margin-top:10px'},'Estimate Breakdown'));
    const breakdown=[
      {label:'Aircon',value:`${est.airconKwh.toFixed(2)} kWh`,color:'#b8720c'},
      {label:'TV',value:`${est.tvKwh.toFixed(2)} kWh`,color:'#2e6e4f'},
      {label:'24/7',value:`${est.alwaysKwh.toFixed(2)} kWh`,color:'#1a56c4'},
      {label:'Sessions',value:`${est.sessionKwh.toFixed(2)} kWh`,color:'#6b4c36'}
    ];
    if(untracked>0)breakdown.push({label:'Untracked',value:`${untracked.toFixed(2)} kWh`,color:'#b83030'});
    ep.appendChild(metricTiles(breakdown));
    ec.appendChild(ep);sec.appendChild(ec);
  }
  // Top expenses
  const allEx=[...foodTx.filter(t=>t.amount>0).map(t=>({name:t.source+(t.note?' — '+t.note:''),amount:t.amount,date:t.date,type:'food'})),...homeEx.map(e=>({name:e.name,amount:e.amount,date:e.date,type:'home'})),...airconUsage.map(u=>({name:'Aircon ('+durationLabel(u.minutes||(u.hours||0)*60)+')',amount:u.cost,date:u.date,type:'aircon'})),...tvUsage.map(u=>({name:'TV ('+durationLabel(u.minutes||(u.hours||0)*60)+')',amount:u.cost,date:u.date,type:'tv'})),...applianceUsage.map(u=>({name:u.name+' ('+durationLabel(u.minutes)+')',amount:u.cost,date:u.date,type:'appliance',badge:u.category||'Appliance'})),...appliances.filter(a=>a.alwaysOn).map(a=>({name:a.name+' (24/7)',amount:applianceMonthly(a,data.meralcoRate).cost,date:`${rm}-01`,type:'appliance',badge:a.category||'Appliance'}))].sort((a,b)=>b.amount-a.amount).slice(0,10);
  if(allEx.length){
    const ec=D('card');ec.style.marginBottom='18px';
    ec.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Top 10 Expenses This Month</span>'}));
    allEx.forEach(e=>{
      const row=D('row cr');row.style.borderBottom='1px solid #e2d9ce';
      const left=D('');
      left.appendChild(h('div',{style:'font-size:12px;font-weight:600'},e.name));
      const info=D('');info.style.cssText='font-size:10px;color:#8a7260;margin-top:1px;display:flex;gap:5px;align-items:center';
      const bcls=e.type==='food'?'bdg-f':e.type==='home'?'bdg-h':e.type==='tv'?'bdg-tv':e.type==='appliance'?'bdg-ap':'bdg-a';
      const blbl=e.type==='food'?'Food':e.type==='home'?'Home':e.type==='tv'?'TV':e.type==='appliance'?e.badge||'Appliance':'Aircon';
      info.appendChild(Sp('bdg '+bcls,blbl));
      info.appendChild(document.createTextNode(new Date(e.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})));
      left.appendChild(info);
      row.appendChild(left);row.appendChild(h('span',{cls:'sf',style:'font-size:15px'},fmt(e.amount)));
      ec.appendChild(row);
    });
    sec.appendChild(ec);
  }
  if(!sortedCats.length&&!pantry.count){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">📊</div><div>No expenses logged for this month yet.</div>';sec.appendChild(e);}
  return sec;
}

// ─── STOCKS TAB ──────────────────────────────────────────────
function renderStocks(){
  const data=S.data,stocks=data.stocks||[];const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='10px';
  toprow.appendChild(h('span',{style:'font-size:14px;font-weight:700;color:#3a2818'},'Pantry & Stocks'));
  const acts=D('');acts.style.cssText='display:flex;gap:6px';
  acts.appendChild(Btn('bp bsm','+ Item',()=>set({modal:'addStock'})));
  toprow.appendChild(acts);sec.appendChild(toprow);
  // Status chips
  const chips=D('chips');
  ['All','Low Stock','Out of Stock'].forEach(s=>{const c=D('chip'+(S.stockStatus===s?' chip-on':''));c.textContent=s==='All'?'All':s==='Low Stock'?'⚠️ Low':'❌ Out';c.onclick=()=>set({stockStatus:s});chips.appendChild(c);});
  ['All',...SCATS].forEach(cat=>{const c=D('chip'+(S.stockCat===cat?' chip-on':''));c.textContent=cat;c.onclick=()=>set({stockCat:cat});chips.appendChild(c);});
  sec.appendChild(chips);
  // Stats
  const outItems=stocks.filter(s=>s.quantity<=0);
  const lowItems=stocks.filter(s=>s.quantity>0&&s.quantity<=s.minQty);
  if(outItems.length||lowItems.length){
    const ac=D('card');ac.style.cssText='background:#fdecea;border:1px solid #f5c2c2;margin-bottom:9px';
    const acp=D('cp');
    if(outItems.length)acp.appendChild(h('div',{style:'font-size:12.5px;color:#b83030;font-weight:700;margin-bottom:4px'},`❌ Out of stock: ${outItems.map(s=>s.name).join(', ')}`));
    if(lowItems.length)acp.appendChild(h('div',{style:'font-size:12.5px;color:#b8720c;font-weight:700'},`⚠️ Running low: ${lowItems.map(s=>s.name).join(', ')}`));
    ac.appendChild(acp);sec.appendChild(ac);
  }
  let filtered=stocks;
  if(S.stockCat!=='All')filtered=filtered.filter(s=>s.category===S.stockCat);
  if(S.stockStatus==='Low Stock')filtered=filtered.filter(s=>s.quantity>0&&s.quantity<=s.minQty);
  if(S.stockStatus==='Out of Stock')filtered=filtered.filter(s=>s.quantity<=0);
  if(!filtered.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">📦</div><div>No pantry items tracked yet.<br/>Add groceries and household supplies<br/>to keep track of your stocks.</div>';sec.appendChild(e);return sec;}
  // Group by category
  const byCat=filtered.reduce((acc,s)=>{if(!acc[s.category])acc[s.category]=[];acc[s.category].push(s);return acc;},{});
  Object.entries(byCat).sort().forEach(([cat,items])=>{
    const card=D('card');card.appendChild(DivHdr(cat));
    items.forEach(item=>{
      const isOut=item.quantity<=0,isLow=item.quantity>0&&item.quantity<=item.minQty;
      const status=isOut?Sp('s-out','OUT'):isLow?Sp('s-low','LOW'):Sp('s-ok','OK');
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;min-height:52px';
      const left=D('');left.style.flex='1';
      const nrow=D('row');nrow.style.marginBottom='2px';
      const nm=h('span',{style:'font-size:12.5px;font-weight:700'},item.name);
      nrow.appendChild(nm);nrow.appendChild(status);left.appendChild(nrow);
      const qrow=D('');qrow.style.cssText='font-size:11px;color:#8a7260';qrow.textContent=`${item.quantity} ${item.unit} available · min: ${item.minQty} ${item.unit}`;
      left.appendChild(qrow);
      if(item.note){const nt=D('');nt.style.cssText='font-size:10.5px;color:#8a7260;font-style:italic';nt.textContent=item.note;left.appendChild(nt);}
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px;flex-shrink:0';
      const minusBtn=h('button',{cls:'qty-btn',onClick:()=>adjStock(item.id,-1)},'-');
      const qv=h('span',{style:`font-weight:800;font-size:15px;min-width:24px;text-align:center;color:${isOut?'#b83030':isLow?'#b8720c':'#1b4d35'}`},String(item.quantity));
      const plusBtn=h('button',{cls:'qty-btn',onClick:()=>adjStock(item.id,1)},'+');
      right.appendChild(minusBtn);right.appendChild(qv);right.appendChild(plusBtn);
      inner.appendChild(left);inner.appendChild(right);
      card.appendChild(swRow(inner,()=>openEdit('stock',item.id),()=>delStock(item.id)));
    });
    sec.appendChild(card);
  });
  sec.appendChild(D(''));sec.lastChild.style.height='18px';
  return sec;
}

// ─── ELECTRICITY TAB ─────────────────────────────────────────
function renderMeterAudit(){
  const data=S.data,f=S.auditF,a=meterAudit(data,f),card=D('card');
  const hdr=D('row');
  hdr.style.cssText='padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce;cursor:pointer;gap:8px';
  const left=D('');left.style.cssText='flex:1;min-width:0';
  left.appendChild(h('span',{style:'font-weight:700;font-size:13px'},'Meter Audit'));
  if(a.valid){
    const sub=h('div',{style:'font-size:10px;color:#8a7260;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},`${a.meterKwh.toFixed(2)} kWh meter · ${a.meterKwh?Math.round(a.matchPct)+'% matched · ':''}${a.gap>=0?'+':''}${a.gap.toFixed(2)} kWh gap`);
    left.appendChild(sub);
  }
  hdr.appendChild(left);
  hdr.appendChild(h('span',{style:'font-size:16px;color:#8a7260;flex-shrink:0'},S.auditOpen?'▴':'▾'));
  hdr.onclick=()=>set({auditOpen:!S.auditOpen});
  card.appendChild(hdr);
  if(!S.auditOpen)return card;
  const cp=D('cp');
  const grid=D('g2');grid.style.marginBottom='8px';
  const addField=(label,key,type='text',step='')=>{
    const input=Inp('',{type,value:f[key]||'',...(step?{step}:{})});
    input.oninput=e=>S.auditF[key]=e.target.value;
    grid.appendChild(Fg(label,input));
  };
  addField('Start Date','startDate','date');addField('Start Time','startTime','time');
  addField('Start Reading','startRead','number','0.001');addField('End Reading','endRead','number','0.001');
  addField('End Date','endDate','date');addField('End Time','endTime','time');
  cp.appendChild(grid);
  const run=Btn('bgfull','Run Audit',()=>set({auditF:{...S.auditF}}));run.style.marginBottom='8px';cp.appendChild(run);
  if(!a.valid){
    cp.appendChild(h('div',{style:'font-size:11px;color:#8a7260;line-height:1.5'},a.error));
    card.appendChild(cp);return card;
  }
  const closeGap=a.meterKwh?Math.abs(a.gap)<=Math.max(1,a.meterKwh*0.1):false;
  const gapColor=closeGap?'#2e6e4f':a.gap>0?'#b8720c':'#8b2d2d';
  cp.appendChild(metricTiles([
    {label:'Meter',value:`${a.meterKwh.toFixed(2)} kWh`,color:'#3a2818'},
    {label:'App Est.',value:`${a.estimatedKwh.toFixed(2)} kWh`,color:'#1a56c4'},
    {label:'Matched',value:a.meterKwh?`${Math.round(a.matchPct)}%`:'--',color:closeGap?'#2e6e4f':gapColor},
    {label:'Gap',value:`${a.gap>=0?'+':''}${a.gap.toFixed(2)} kWh`,color:gapColor}
  ],true));
  cp.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;line-height:1.5;margin-top:7px'},`${durationLabel(a.hours*60)} window · ${a.meterKwh?Math.round(a.matchPct)+'% matched · ':''}Sessions ${a.loggedKwh.toFixed(2)} kWh · 24/7 ${a.alwaysKwh.toFixed(2)} kWh · ${fmt2(a.estimatedKwh*a.rate)} estimated. Positive gap means meter used more than logged.`));
  const parts=D('g2');parts.style.marginTop='8px';
  [
    ['Aircon',a.airconKwh,a.aircon.length],
    ['TV',a.tvKwh,a.tv.length],
    ['Sessions',a.sessionKwh,a.appliances.length],
    ['24/7',a.alwaysKwh,a.alwaysRows.length]
  ].forEach(([label,kwh,count])=>{
    const box=D('');box.style.cssText='background:#faf6f1;border:1px solid #e2d9ce;border-radius:8px;padding:7px';
    box.appendChild(h('div',{cls:'lbl'},label));
    box.appendChild(h('div',{cls:'sf',style:'font-size:15px;margin-top:1px'},`${kwh.toFixed(3)} kWh`));
    box.appendChild(h('div',{style:'font-size:9.5px;color:#8a7260'},`${count} item${count!==1?'s':''}`));
    parts.appendChild(box);
  });
  cp.appendChild(parts);
  const rows=[
    ...a.aircon.map(u=>({type:'Aircon',name:`${airconModeLabel(u.mode,u.sleepMode)} · ${durationLabel(u.minutes||(u.hours||0)*60)}`,date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'date only',kwh:u.kwh})),
    ...a.tv.map(u=>({type:'TV',name:durationLabel(u.minutes||(u.hours||0)*60),date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'date only',kwh:u.kwh})),
    ...a.appliances.map(u=>({type:'Appliance',name:`${u.name} · ${durationLabel(u.minutes)}`,date:u.date,time:u.start&&u.end?`${fmtTime12(u.start)}-${fmtTime12(u.end)}`:'date only',kwh:u.kwh})),
    ...a.alwaysRows.map(u=>({type:'24/7',name:u.name,date:'whole window',time:`${parseFloat(u.watts)||0}W x ${parseFloat(u.qty)||1}`,kwh:u.kwh}))
  ].sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.time).localeCompare(String(y.time)));
  const list=D('');list.style.marginTop='8px';
  rows.forEach(r=>{
    const row=D('row');row.style.cssText='border-top:1px solid #e2d9ce;padding:7px 0;gap:8px;align-items:flex-start';
    const left=D('');left.style.cssText='flex:1;min-width:0';
    left.appendChild(h('div',{style:'font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},`${r.type} · ${r.name}`));
    left.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},`${r.date} · ${r.time}`));
    row.appendChild(left);
    row.appendChild(h('div',{cls:'sf',style:'font-size:13px;flex-shrink:0'},`${(parseFloat(r.kwh)||0).toFixed(3)} kWh`));
    list.appendChild(row);
  });
  if(rows.length)cp.appendChild(list);
  card.appendChild(cp);
  return card;
}
function renderCurrentlyOn(data=S.data){
  const active=data.activeSessions||[],liveCard=D('card');
  liveCard.appendChild(DivHdr('Currently On'));
  if(active.length){
    active.forEach(s=>{
      const est=activeEstimate(s,new Date(),data);
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;gap:9px';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700'},s.name));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${s.type==='aircon'?'Aircon · '+airconModeLabel(s.mode,s.sleepMode):s.type==='tv'?'TV':'Appliance'} · on since ${fmtTime12(timeOf(new Date(s.startedAt)))} · ${durationLabel(est.minutes)}${s.outdoorTemp!==''&&s.outdoorTemp!=null?' · out '+s.outdoorTemp+'C':''}`));
      const right=D('');right.style.cssText='text-align:right;flex-shrink:0';
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},`${est.kwh.toFixed(3)} kWh`));
      right.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},fmt2(est.cost)));
      const stop=Btn('ba bsm','Off',()=>stopActiveSession(s.id));stop.style.marginTop='4px';
      const cancel=Btn('bgsm','Cancel',()=>cancelActiveSession(s.id));cancel.style.marginTop='4px';cancel.style.marginLeft='4px';
      right.appendChild(stop);right.appendChild(cancel);
      inner.appendChild(left);inner.appendChild(right);liveCard.appendChild(inner);
    });
  }else{
    const empty=D('empty');empty.style.cssText='padding:16px;color:#8a7260;font-size:12px;text-align:center';empty.textContent='Nothing is currently running.';liveCard.appendChild(empty);
  }
  return liveCard;
}
function renderAircon(){
  const data=S.data,sec=D('sec');
  const rates=airconRates(data);
  const usage=data.airconUsage||[],tvUsage=data.tvUsage||[],appliances=data.appliances||[],applianceUsage=data.applianceUsage||[];
  const readDay=meralcoReadDay(data);
  const cycleMap=new Map([...usage,...tvUsage,...applianceUsage,{date:toStr()}].map(e=>{const c=cycleForDate(e.date,readDay);return[c.key,c];}));
  const cycles=[...cycleMap.values()].sort((a,b)=>b.key.localeCompare(a.key));
  if(cycles.length&&!cycles.some(c=>c.key===S.viewMk))S.viewMk=cycleForDate(new Date(),readDay).key;
  const selectedCycle=cycles.find(c=>c.key===S.viewMk)||cycleForDate(new Date(),readDay);
  const mUsage=usage.filter(u=>inCycle(u,selectedCycle));
  const mTv=tvUsage.filter(u=>inCycle(u,selectedCycle));
  const mApplianceUsage=applianceUsage.filter(u=>inCycle(u,selectedCycle));
  const mCost=mUsage.reduce((s,u)=>s+u.cost,0),tvCost=mTv.reduce((s,u)=>s+u.cost,0);
  const alwaysOn=appliances.filter(a=>a.alwaysOn);
  const alwaysOnMonthlyCost=alwaysOn.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).cost,0);
  const alwaysOnMonthlyKwh=alwaysOn.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).kwh,0);
  const alwaysOnCost=alwaysOnMonthlyCost/30*cycleDays(selectedCycle);
  const alwaysOnKwh=alwaysOnMonthlyKwh/30*cycleDays(selectedCycle);
  const applianceSessionCost=mApplianceUsage.reduce((s,u)=>s+u.cost,0);
  const applianceSessionKwh=mApplianceUsage.reduce((s,u)=>s+u.kwh,0);
  const applianceCost=alwaysOnCost+applianceSessionCost,applianceKwh=alwaysOnKwh+applianceSessionKwh;
  const mHours=mUsage.reduce((s,u)=>s+u.hours,0);
  const airconKwh=mUsage.reduce((s,u)=>s+u.kwh,0);
  const tvHours=mTv.reduce((s,u)=>s+u.hours,0);
  const tvKwh=mTv.reduce((s,u)=>s+u.kwh,0);
  const meralcoCycleKwh=meralcoKwhForCycle(selectedCycle,data);
  const estimatedCycleKwh=airconKwh+tvKwh+applianceKwh;
  const displayCycleKwh=meralcoCycleKwh||estimatedCycleKwh;
  const meralcoDailyKwh=meralcoCycleKwh?meralcoCycleKwh/cycleDays(selectedCycle):0;
  const eChart=electricityDailyChart(selectedCycle,data,'7');
  const maxECost=Math.max(...eChart.map(x=>x.cost),1);

  const toprow=D('row');toprow.style.marginBottom='10px';
  const cycleSel=Sel(S.viewMk,cycles.map(c=>c.key),v=>set({viewMk:v}));
  cycleSel.style.cssText='padding:5px 9px;font-size:12px;border-radius:7px;border:1.5px solid #e2d9ce;background:#fff;max-width:160px';
  [...cycleSel.options].forEach(o=>{const c=cycles.find(x=>x.key===o.value);if(c)o.text=cycleLabel(c);});
  const titleWrap=D('');titleWrap.appendChild(h('div',{style:'font-size:14px;font-weight:700'},'⚡ Electricity Usage'));titleWrap.appendChild(cycleSel);
  toprow.appendChild(titleWrap);
  const topActs=D('');topActs.style.cssText='display:flex;gap:6px';
  topActs.appendChild(Btn('bgsm','Appliances',()=>set({tab:'appliances'})));
  topActs.appendChild(Btn('bgsm','⚙️ Config',()=>set({modal:'airSet',airSetF:{rate:data.meralcoRate,readDay:readDay,startup:rates.startup,sleepDay:rates.sleepDay,sleepNight:rates.sleepNight,ecoDay:rates.ecoDay,ecoNight:rates.ecoNight,day:rates.day,night:rates.night,defaultMode:airconModeFrom(data.airconDefaultMode,data.airconDefaultSleepMode),defaultSleep:data.airconDefaultSleepMode!==false,defaultTemp:data.airconDefaultTemp||'29',tempBaseline:data.airconTempBaseline||29,tempStep:data.airconTempStepPct||7,outdoorBaseline:data.airconOutdoorBaseline||30,outdoorStep:data.airconOutdoorStepPct||2.5,tvWatts:data.tvWatts||175}})));
  toprow.appendChild(topActs);
  sec.appendChild(toprow);

  const hero=D('card cg');hero.innerHTML=`<div class="cp"><div class="lblw">${cycleLabel(selectedCycle)} Est. Electricity</div><div class="sf" style="font-size:32px;color:#fff;margin:2px 0">${fmt2(mCost+tvCost+applianceCost)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">Total ${displayCycleKwh.toFixed(2)} kWh${meralcoCycleKwh?' Meralco':' estimated'} · Read day ${readDay} · 24/7 ${fmt2(alwaysOnCost)} · Sessions ${fmt2(applianceSessionCost)} · Aircon ${durationLabel(mHours*60)} · TV ${durationLabel(tvHours*60)}</div></div>`;
  sec.appendChild(hero);

  sec.appendChild(renderWeatherCard(data,{title:'Outdoor Weather'}));

  const stats=D('g2');stats.style.marginBottom='9px';
  const s1=D('card');s1.innerHTML=`<div class="cp"><div class="lbl">Always On</div><div class="sf" style="font-size:21px;margin:2px 0">${fmt2(alwaysOnCost)}</div><div style="font-size:10.5px;color:#8a7260">${alwaysOnKwh.toFixed(3)} kWh/cycle</div></div>`;
  const s2=D('card');s2.innerHTML=`<div class="cp"><div class="lbl">Appliance Sessions</div><div class="sf" style="font-size:21px;margin:2px 0">${fmt2(applianceSessionCost)}</div><div style="font-size:10.5px;color:#8a7260">${mApplianceUsage.length} log${mApplianceUsage.length!==1?'s':''} · ${applianceSessionKwh.toFixed(3)} kWh</div></div>`;
  stats.appendChild(s1);stats.appendChild(s2);sec.appendChild(stats);

  const kwhCard=D('card');kwhCard.innerHTML=`<div class="cp"><div class="lbl">Total kWh This Cycle</div><div class="sf" style="font-size:24px;margin:2px 0">${displayCycleKwh.toFixed(2)} kWh</div><div style="font-size:10.5px;color:#8a7260">${meralcoCycleKwh?'From Meralco bill input':'Estimated from logs'} · Aircon ${airconKwh.toFixed(2)} · TV ${tvKwh.toFixed(2)} · Appliances ${applianceKwh.toFixed(2)}</div></div>`;
  sec.appendChild(kwhCard);
  sec.appendChild(renderMeterAudit());

  let alwaysCard=null;
  if(alwaysOn.length){
    alwaysCard=D('card');alwaysCard.appendChild(DivHdr('24/7 Appliances'));
    alwaysOn.sort((a,b)=>applianceMonthly(b,data.meralcoRate).cost-applianceMonthly(a,data.meralcoRate).cost).forEach(a=>{
      const monthly=applianceMonthly(a,data.meralcoRate);
      const cycleCost=monthly.cost/30*cycleDays(selectedCycle),cycleKwh=monthly.kwh/30*cycleDays(selectedCycle);
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;gap:9px';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700'},a.name));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${a.category} · ${applianceLabel(a)} · ${cycleKwh.toFixed(3)} kWh/cycle`));
      const right=D('');right.style.cssText='text-align:right;flex-shrink:0';
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(cycleCost)));
      right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},'cycle est.'));
      inner.appendChild(left);inner.appendChild(right);
      alwaysCard.appendChild(swRow(inner,()=>openEdit('appliance',a.id),()=>delAppliance(a.id)));
    });
  }

  const cc=D('card');cc.style.cursor='pointer';cc.onclick=()=>set({modal:'electricityMonthChart',chartCycleKey:selectedCycle.key});const ccp=D('cp');ccp.style.paddingBottom='5px';
  const cr=D('row');cr.style.marginBottom='11px';
  const wkCost=eChart.reduce((s,x)=>s+x.cost,0),wkKwh=eChart.reduce((s,x)=>s+x.kwh,0);
  cr.innerHTML=`<span class="lbl">7-Day Electricity</span><span style="font-size:11px;color:#8a7260">${fmt2(wkCost)} · ${wkKwh.toFixed(2)} kWh${meralcoDailyKwh?' · '+meralcoDailyKwh.toFixed(2)+'/day bill avg':''}</span>`;
  const bars=D('bw');
  eChart.forEach(cd=>{
    const isT=cd.ds===toStr(),pct=cd.cost/maxECost;
    const col=D('bc');
    const nl=D('');nl.style.cssText='font-size:7px;color:#8a7260;font-weight:600;text-align:center;height:12px';if(cd.cost>0||cd.meralcoDailyKwh)nl.textContent=cd.meralcoDailyKwh?cd.meralcoDailyKwh.toFixed(2)+'k':cd.cost.toFixed(2);col.appendChild(nl);
    const bg=D('bbg');
    const fill=D('bf');fill.style.cssText=`height:${Math.max(pct*100,cd.cost>0?8:0)}%;background:transparent;display:flex;flex-direction:column-reverse;overflow:hidden;${isT?'outline:1.5px solid #b8720c;outline-offset:-1.5px;':''}`;
    if(cd.cost>0){
      const airSeg=D('');airSeg.style.cssText=`height:${(cd.airCost/cd.cost*100).toFixed(1)}%;background:#b8720c;width:100%`;fill.appendChild(airSeg);
      const tvSeg=D('');tvSeg.style.cssText=`height:${(cd.tvCost/cd.cost*100).toFixed(1)}%;background:#2e6e4f;width:100%`;fill.appendChild(tvSeg);
      const apSeg=D('');apSeg.style.cssText=`height:${(cd.applianceCost/cd.cost*100).toFixed(1)}%;background:#1a56c4;width:100%`;fill.appendChild(apSeg);
    }
    bg.appendChild(fill);col.appendChild(bg);
    const lel=D('');lel.style.cssText=`font-size:7.5px;color:${isT?'#b8720c':'#8a7260'};font-weight:${isT?800:400};text-align:center`;lel.textContent=cd.label;col.appendChild(lel);
    bars.appendChild(col);
  });
  const legend=D('');legend.style.cssText='font-size:10px;color:#8a7260;margin-top:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  legend.appendChild(h('span',{},'■ Aircon'));legend.lastChild.style.color='#b8720c';
  legend.appendChild(h('span',{},'■ TV'));legend.lastChild.style.color='#2e6e4f';
  legend.appendChild(h('span',{},'■ Appliances'));legend.lastChild.style.color='#1a56c4';
  legend.appendChild(h('span',{style:'color:#8a7260'},meralcoDailyKwh?'Top labels show Meralco avg kWh/day':'Estimated cost from logs'));
  ccp.appendChild(cr);ccp.appendChild(bars);ccp.appendChild(legend);
  cc.appendChild(ccp);sec.appendChild(cc);

  const defaultMode=airconModeFrom(data.airconDefaultMode,data.airconDefaultSleepMode);
  const ap=airconProfile(data);
  const spec=D('card');spec.innerHTML=`<div class="cp"><div class="lbl">${ap.model} Estimate</div><div style="font-size:12px;color:#3a2818;line-height:1.6;margin-top:5px">Rated around <b>${ap.ratedWatts}W</b> with ${ap.minWatts}-${ap.maxWatts}W inverter range, CSPF <b>${ap.cspf}</b>, DOE <b>${ap.doeMonthlyKwh} kWh/month</b>. Startup now tapers for the first ${durationLabel(60)} from <b>${rates.startup} kWh/hr</b> into the selected mode. Sleep <b>${rates.sleepDay}/${rates.sleepNight}</b>, Eco <b>${rates.ecoDay}/${rates.ecoNight}</b>, Normal <b>${rates.day}/${rates.night}</b> day/night kWh/hr. Set temp adjusts by <b>${data.airconTempStepPct||7}%/C</b>; outdoor by <b>${data.airconOutdoorStepPct||2.5}%/C</b>.</div></div>`;
  sec.appendChild(spec);

  const actions=D('');actions.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';
  actions.appendChild(Btn('bgfull','+ Aircon Session',()=>{const mode=airconModeFrom(data.airconDefaultMode,data.airconDefaultSleepMode),w=data.weather||{};set({modal:'addAircon',airconF:{...timedSessionDraft(S.airconF,480),mode,sleepMode:mode==='sleep',tempC:data.airconDefaultTemp||S.airconF.tempC||'29',roomTemp:S.airconF.roomTemp||'',outdoorTemp:w.temp??S.airconF.outdoorTemp??'',outdoorFeels:w.apparent??S.airconF.outdoorFeels??'',outdoorHumidity:w.humidity??S.airconF.outdoorHumidity??''}});}));
  actions.appendChild(Btn('bgfull','Start Aircon',()=>startActiveSession('aircon')));
  actions.appendChild(Btn('bgfull','+ TV Hours',()=>set({modal:'addTv',tvF:timedSessionDraft(S.tvF,180)})));
  actions.appendChild(Btn('bgfull','Start TV',()=>startActiveSession('tv')));
  actions.appendChild(Btn('bgfull','+ Appliance Session',()=>{
    const first=(data.appliances||[]).find(a=>!a.alwaysOn);
    set({modal:'logAppliance',applianceSessionF:applianceSessionDraft(first)});
  }));
  actions.appendChild(Btn('bgfull','Manage Appliances',()=>set({tab:'appliances'})));
  sec.appendChild(actions);
  sec.appendChild(renderCurrentlyOn(data));
  if(alwaysCard)sec.appendChild(alwaysCard);

  if(!mUsage.length&&!mTv.length&&!mApplianceUsage.length&&!alwaysOnCost){const e=D('card empty');e.innerHTML='<div>No electricity usage logged for this month.</div>';sec.appendChild(e);return sec;}

  if(mUsage.length){
  const card=D('card');card.appendChild(DivHdr('Aircon History'));
  mUsage.forEach(u=>{
    const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
    const left=D('');
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`Aircon · ${durationLabel(u.minutes||(u.hours||0)*60)} · ${airconModeLabel(u.mode,u.sleepMode)}${u.tempC!==''&&u.tempC!=null?' · set '+u.tempC+'C':''}${u.roomTemp!==''&&u.roomTemp!=null?' · room '+u.roomTemp+'C':''}`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}${u.start&&u.end?' · '+fmtTime12(u.start)+'-'+fmtTime12(u.end):''} · ${u.kwh.toFixed(2)} kWh${u.outdoorTemp!==''&&u.outdoorTemp!=null?' · out '+u.outdoorTemp+'C':''}`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(u.cost)));
    right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},`@${u.rateAtTime}/kWh`));
    inner.appendChild(left);inner.appendChild(right);
    card.appendChild(swRow(inner,()=>openEdit('aircon',u.id),()=>delAircon(u.id)));
  });
  sec.appendChild(card);
  }
  if(mTv.length){
  const tvCard=D('card');tvCard.appendChild(DivHdr('TV History'));
  mTv.forEach(u=>{
    const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
    const left=D('');
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`TV · ${durationLabel(u.minutes||(u.hours||0)*60)}`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}${u.start&&u.end?' · '+fmtTime12(u.start)+'-'+fmtTime12(u.end):''} · ${u.watts}W · ${u.kwh.toFixed(2)} kWh`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(u.cost)));
    right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},`@${u.rateAtTime}/kWh`));
    inner.appendChild(left);inner.appendChild(right);
    tvCard.appendChild(swRow(inner,()=>openEdit('tv',u.id),()=>delTv(u.id)));
  });
  sec.appendChild(tvCard);
  }
  if(mApplianceUsage.length){
  const apHist=D('card');apHist.appendChild(DivHdr('Appliance Session History'));
  mApplianceUsage.forEach(u=>{
    const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
    const left=D('');
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`${u.name} · ${durationLabel(u.minutes)}`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}${u.start&&u.end?' · '+fmtTime12(u.start)+'-'+fmtTime12(u.end):''} · ${u.qty}x ${u.watts}W · ${u.kwh.toFixed(3)} kWh`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(u.cost)));
    right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},`@${u.rateAtTime}/kWh`));
    inner.appendChild(left);inner.appendChild(right);
    apHist.appendChild(swRow(inner,()=>openEdit('applianceUsage',u.id),()=>delApplianceUsage(u.id)));
  });
  sec.appendChild(apHist);
  }
  return sec;
}

// ─── APPLIANCE MANAGER TAB ──────────────────────────────────
function renderAppliances(){
  const data=S.data,appliances=data.appliances||[],usage=data.applianceUsage||[],sec=D('sec');
  const always=appliances.filter(a=>a.alwaysOn);
  const session=appliances.filter(a=>!a.alwaysOn);
  const alwaysCost=always.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).cost,0);
  const monthUsage=usage.filter(u=>mk(u.date)===curMk());
  const sessionCost=monthUsage.reduce((s,u)=>s+u.cost,0);

  const top=D('row');top.style.marginBottom='10px';
  top.appendChild(h('span',{style:'font-size:14px;font-weight:700'},'Appliance Manager'));
  top.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addAppliance'})));
  sec.appendChild(top);

  const hero=D('card cg');hero.innerHTML=`<div class="cp"><div class="lblw">Configured Appliance Estimate</div><div class="sf" style="font-size:30px;color:#fff;margin:2px 0">${fmt2(alwaysCost+sessionCost)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">24/7 monthly ${fmt2(alwaysCost)} · ${mklbl(curMk())} sessions ${fmt2(sessionCost)}</div></div>`;
  sec.appendChild(hero);

  const quick=D('');quick.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';
  const first=session[0];
  quick.appendChild(Btn('bgfull','Log Session',()=>set({modal:'logAppliance',applianceSessionF:applianceSessionDraft(first)}),!first));
  quick.appendChild(Btn('bgfull','Electricity Overview',()=>set({tab:'aircon'})));
  sec.appendChild(quick);

  const ap=airconProfile(data),rates=airconRates(data);
  const profileCard=D('card');profileCard.appendChild(DivHdr('Aircon Profile'));
  const profileBody=D('cp');
  const pr=D('row');pr.style.cssText='align-items:flex-start;gap:9px';
  const pl=D('');pl.style.cssText='flex:1;min-width:0';
  pl.appendChild(h('div',{style:'font-size:13px;font-weight:700'},ap.model));
  pl.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;line-height:1.55;margin-top:2px'},`Outdoor ${ap.outdoorModel} · ${ap.coolingKw} kW cooling · ${ap.ratedWatts}W rated · ${ap.minWatts}-${ap.maxWatts}W inverter range · CSPF ${ap.cspf} · DOE ${ap.doeMonthlyKwh} kWh/month`));
  pl.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;line-height:1.55;margin-top:4px'},`Estimate rates: Startup ${rates.startup} · Sleep ${rates.sleepDay}/${rates.sleepNight} · Eco ${rates.ecoDay}/${rates.ecoNight} · Normal ${rates.day}/${rates.night}. Set temp ${data.airconTempStepPct||7}%/C from ${data.airconTempBaseline||29}C.`));
  const edit=Btn('bgsm','Edit',openAirconProfile);edit.style.flexShrink='0';
  pr.appendChild(pl);pr.appendChild(edit);profileBody.appendChild(pr);profileCard.appendChild(profileBody);sec.appendChild(profileCard);

  const alwaysCard=D('card');alwaysCard.appendChild(DivHdr('24/7 Appliances'));
  if(always.length){
    always.sort((a,b)=>applianceMonthly(b,data.meralcoRate).cost-applianceMonthly(a,data.meralcoRate).cost).forEach(a=>{
      const est=applianceMonthly(a,data.meralcoRate);
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;gap:9px';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700'},a.name));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${a.category} · ${applianceLabel(a)} · ${est.kwh.toFixed(3)} kWh/month`));
      if(a.note)left.appendChild(h('div',{style:'font-size:10px;color:#8a7260;font-style:italic'},a.note));
      const right=D('');right.style.cssText='text-align:right;flex-shrink:0';
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(est.cost)));
      right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},'monthly'));
      inner.appendChild(left);inner.appendChild(right);
      alwaysCard.appendChild(swRow(inner,()=>openEdit('appliance',a.id),()=>delAppliance(a.id)));
    });
  }else alwaysCard.appendChild(Object.assign(D('empty'),{textContent:'No 24/7 appliances configured.'}));
  sec.appendChild(alwaysCard);

  const sessionCard=D('card');sessionCard.appendChild(DivHdr('Session Appliances'));
  if(session.length){
    session.sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name)).forEach(a=>{
      const est=applianceSessionEstimate(a,a.sessionMinutes,data.meralcoRate);
      const inner=D('row cr');inner.style.cssText='border-bottom:1px solid #e2d9ce;gap:9px';
      const left=D('');left.style.cssText='flex:1;min-width:0';
      left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700'},a.name));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${a.category} · ${applianceLabel(a)} · ${est.kwh.toFixed(3)} kWh/session`));
      if(a.note)left.appendChild(h('div',{style:'font-size:10px;color:#8a7260;font-style:italic'},a.note));
      const right=D('');right.style.cssText='text-align:right;flex-shrink:0';
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt2(est.cost)));
      right.appendChild(h('button',{cls:'btn bsm',style:'margin-top:4px',onClick:()=>set({modal:'logAppliance',applianceSessionF:applianceSessionDraft(a)})},'Log'));
      right.appendChild(h('button',{cls:'btn bgsm',style:'margin-top:4px;margin-left:4px',onClick:()=>startActiveSession('appliance',{applianceId:a.id})},'Start'));
      inner.appendChild(left);inner.appendChild(right);
      sessionCard.appendChild(swRow(inner,()=>openEdit('appliance',a.id),()=>delAppliance(a.id)));
    });
  }else sessionCard.appendChild(Object.assign(D('empty'),{textContent:'No session appliances configured.'}));
  sec.appendChild(sessionCard);

  sec.appendChild(D(''));sec.lastChild.style.height='18px';
  return sec;
}

// ─── LISTS & DEFAULTS PAGE ──────────────────────────────────
function renderListsDefaults(){
  const data=S.data,sec=D('sec');
  if(!S.listsF||!S.listsF.foodSources){
    S.listsF={
      foodSources:foodSources(data).join('\n'),
      homeCategories:homeCategories(data).join('\n'),
      homeStores:homeStores(data).join('\n'),
      applianceCategories:applianceCategories(data).join('\n'),
      dailyBudget:String(data.dailyBudget||380),
      groceryBudget:String(data.groceryBudget||5000)
    };
  }
  const f=S.listsF;
  const hero=D('card cg');hero.innerHTML=`<div class="cp"><div class="lblw">Lists & Defaults</div><div class="sf" style="font-size:26px;color:#fff;margin:3px 0">Personalize Your Tracker</div><div style="font-size:11px;color:rgba(255,255,255,.58);line-height:1.45">Budgets, food sources, home categories, stores, and appliance categories used across forms and reports.</div></div>`;
  sec.appendChild(hero);

  const budgetBox=(label,key,min,max,step)=>{
    const box=D('card');box.style.marginBottom='0';box.appendChild(DivHdr(label));const cp=D('cp');const row=D('row');row.style.marginBottom='7px';
    const val=h('span',{cls:'sf amber-c',style:'font-size:18px'},fmt(f[key]||0));
    row.appendChild(h('span',{cls:'lbl'},'Default'));row.appendChild(val);cp.appendChild(row);
    const slider=h('input',{type:'range',min,max,step,value:f[key]});
    slider.oninput=e=>{f[key]=e.target.value;val.textContent=fmt(e.target.value);};
    cp.appendChild(slider);
    const range=D('row');range.style.marginTop='3px';range.innerHTML=`<span style="font-size:10px;color:#8a7260">${fmt(min)} min</span><span style="font-size:10px;color:#8a7260">${fmt(max)}</span>`;
    cp.appendChild(range);box.appendChild(cp);return box;
  };
  const budgetGrid=D('');budgetGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:9px';
  budgetGrid.appendChild(budgetBox('Daily Meals Budget','dailyBudget',150,700,10));
  budgetGrid.appendChild(budgetBox('Groceries Budget','groceryBudget',1000,15000,500));
  sec.appendChild(budgetGrid);

  const ta=(key,label,sub)=>{
    const card=D('card');card.appendChild(DivHdr(label));
    const cp=D('cp');
    if(sub)cp.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:9px'},sub));
    const el=h('textarea',{cls:'inp',rows:'6',style:'resize:vertical;line-height:1.45;min-height:118px',value:f[key]||''});
    el.value=f[key]||'';el.oninput=e=>f[key]=e.target.value;cp.appendChild(el);
    cp.appendChild(h('div',{style:'font-size:10px;color:#8a7260;margin-top:6px'},'One label per line.'));
    card.appendChild(cp);sec.appendChild(card);
  };
  ta('foodSources','Food Sources','Keep Groceries if you want food entries to add pantry stock.');
  ta('homeCategories','Home Categories','Used by home expenses, price scans, and reports.');
  ta('homeStores','Home Stores','Reusable store choices for home items and prices.');
  ta('applianceCategories','Appliance Categories','Used in Appliance Manager and report badges.');

  const save=Btn('bp bfull','Save Lists & Defaults',saveListsDefaults);save.style.marginBottom='18px';sec.appendChild(save);
  return sec;
}

// ─── MODALS ──────────────────────────────────────────────────
function renderModal(){
  if(!S.modal)return null;
  const bg=D('mbg');bg.onclick=e=>{if(e.target===bg)set({modal:null});};
  const box=D('mbox');
  const M=(t,c)=>{const tt=D('mt');tt.textContent=t;box.appendChild(tt);box.appendChild(c);bg.appendChild(box);return bg;};
  if(S.modal==='mealsMonthChart'){
    const monthKey=S.chartMonthKey||curMk(),data=S.data,chart=mealsDailyChart(monthKey,data),maxSpend=Math.max(...chart.map(x=>x.spend),data.dailyBudget||1,1);
    const total=chart.reduce((s,x)=>s+x.spend,0),mealCount=chart.reduce((s,x)=>s+x.count,0),avg=total/chart.length,overDays=chart.filter(x=>x.over).length;
    if(!S.selectedMealDate||mk(S.selectedMealDate)!==monthKey)S.selectedMealDate=chart.find(x=>x.count)?.ds||`${monthKey}-01`;
    const selectedDay=chart.find(x=>x.ds===S.selectedMealDate)||chart[0],selectedItems=selectedDay?.items||[];
    const c=D('');
    const nav=D('row');nav.style.cssText='gap:8px;margin-bottom:9px';
    const prev=Btn('bgsm','<',()=>set({chartMonthKey:shiftMonthKey(monthKey,-1)}));prev.style.width='36px';
    const next=Btn('bgsm','>',()=>set({chartMonthKey:shiftMonthKey(monthKey,1)}));next.style.width='36px';
    nav.appendChild(prev);nav.appendChild(h('div',{cls:'sf',style:'font-size:16px;flex:1;text-align:center;color:#3a2818'},mklbl(monthKey)));nav.appendChild(next);c.appendChild(nav);
    c.appendChild(h('div',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`${mklbl(monthKey)} · ${mealCount} meal log${mealCount!==1?'s':''} · ${fmt(total)} spent · Avg ${fmt(Math.round(avg))}/day · ${overDays} over-budget day${overDays!==1?'s':''}`));
    const cal=D('');cal.style.cssText='display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-bottom:10px';
    ['S','M','T','W','T','F','S'].forEach(d=>cal.appendChild(h('div',{style:'font-size:9px;color:#8a7260;font-weight:800;text-align:center;padding-bottom:2px'},d)));
    const padStart=chart[0]?.date.getDay()||0,padEnd=(7-((padStart+chart.length)%7))%7;
    for(let i=0;i<padStart;i++){const blank=D('');blank.style.cssText='min-height:64px;border-radius:7px;background:#faf6f1;border:1px solid transparent';cal.appendChild(blank);}
    chart.forEach(cd=>{
      const isT=cd.ds===toStr(),isSel=cd.ds===S.selectedMealDate,intensity=Math.min(1,cd.spend/maxSpend),cell=D('');
      cell.style.cssText=`min-height:64px;border:1.5px solid ${isSel?'#1b4d35':isT?'#b8720c':cd.over?'#f5c2c2':'#e2d9ce'};background:${cd.count?cd.over?`rgba(184,48,48,${0.05+intensity*.12})`:`rgba(27,77,53,${0.04+Math.max(intensity,.25)*.1})`:'#fff'};border-radius:7px;padding:5px 4px;display:flex;flex-direction:column;gap:3px;overflow:hidden;cursor:pointer`;
      cell.onclick=()=>set({selectedMealDate:cd.ds});
      const top=D('row');top.style.cssText='align-items:flex-start;gap:2px';
      top.appendChild(h('span',{style:`font-size:11px;font-weight:800;color:${isT?'#1b4d35':cd.over?'#b83030':'#3a2818'}`},cd.label));
      cell.appendChild(top);
      cell.appendChild(h('div',{style:`font-size:9px;font-weight:700;color:${cd.over?'#b83030':'#3a2818'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`},cd.spend?fmt(cd.spend):(cd.count?`${cd.count} meal${cd.count!==1?'s':''}`:'')));
      cell.appendChild(h('div',{style:'font-size:7.5px;color:#8a7260;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},cd.count?`${cd.count} log${cd.count!==1?'s':''}${cd.spend?` · ${Math.round(cd.spend/(data.dailyBudget||1)*100)}%`:''}`:'No meals'));
      const track=D('');track.style.cssText='height:5px;background:#ede6dc;border-radius:3px;overflow:hidden;margin-top:auto';
      const fill=D('');fill.style.cssText=`height:100%;width:${Math.min(100,cd.spend/maxSpend*100).toFixed(1)}%;background:${cd.over?'#d45c5c':'#2e6e4f'}`;track.appendChild(fill);cell.appendChild(track);
      cal.appendChild(cell);
    });
    for(let i=0;i<padEnd;i++){const blank=D('');blank.style.cssText='min-height:64px;border-radius:7px;background:#faf6f1;border:1px solid transparent';cal.appendChild(blank);}
    c.appendChild(cal);
    const dayCard=D('card');dayCard.style.marginBottom='10px';dayCard.appendChild(DivHdr(`Meals on ${new Date((selectedDay?.ds||toStr())+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`));
    if(selectedItems.length){
      selectedItems.forEach(item=>{
        const row=D('row cr');row.style.cssText='border-bottom:1px solid #e2d9ce;gap:8px';
        const left=D('');left.style.cssText='min-width:0;flex:1';
        left.appendChild(h('div',{style:'font-size:12px;font-weight:700;color:#3a2818;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},item.note||item.source));
        left.appendChild(h('div',{style:'font-size:10px;color:#8a7260;margin-top:1px'},item.source));
        row.appendChild(left);
        if(item.source!=='Home-cooked')row.appendChild(h('span',{cls:'sf',style:`font-size:13px;color:${item.amount?'#b83030':'#8a7260'};flex-shrink:0`},item.amount?fmt(item.amount):fmt(0)));
        dayCard.appendChild(row);
      });
    }else{
      const empty=D('empty');empty.style.cssText='padding:14px;color:#8a7260;font-size:12px;text-align:center';empty.textContent='No meal logs for this day.';dayCard.appendChild(empty);
    }
    c.appendChild(dayCard);
    const legend=D('');legend.style.cssText='font-size:10px;color:#8a7260;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px';
    legend.appendChild(h('span',{style:'color:#2e6e4f'},'■ Within budget'));
    legend.appendChild(h('span',{style:'color:#d45c5c'},'■ Over budget'));
    legend.appendChild(h('span',{style:'color:#8a7260'},`Daily budget ${fmt(data.dailyBudget)}`));
    c.appendChild(legend);
    c.appendChild(Btn('bp bfull','Close',()=>set({modal:null})));
    return M('Meals Calendar',c);
  }
  if(S.modal==='electricityMonthChart'){
    const data=S.data,readDay=meralcoReadDay(data),cycle=cycleForDate(S.chartCycleKey||toStr(),readDay);
    const chart=electricityDailyChart(cycle,data,'cycle'),maxCost=Math.max(...chart.map(x=>x.cost),1);
    const totalCost=chart.reduce((s,x)=>s+x.cost,0),totalKwh=chart.reduce((s,x)=>s+x.kwh,0),meralcoKwh=meralcoKwhForCycle(cycle,data);
    const c=D('');
    const nav=D('row');nav.style.cssText='gap:8px;margin-bottom:9px';
    const prev=Btn('bgsm','<',()=>set({chartCycleKey:shiftCycleKey(cycle.key,-1,readDay)}));prev.style.width='36px';
    const next=Btn('bgsm','>',()=>set({chartCycleKey:shiftCycleKey(cycle.key,1,readDay)}));next.style.width='36px';
    nav.appendChild(prev);nav.appendChild(h('div',{cls:'sf',style:'font-size:14px;flex:1;text-align:center;color:#3a2818'},cycleLabel(cycle)));nav.appendChild(next);c.appendChild(nav);
    c.appendChild(h('div',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`${cycleLabel(cycle)} · ${fmt2(totalCost)} · ${(meralcoKwh||totalKwh).toFixed(2)} kWh${meralcoKwh?' Meralco':' estimated'}`));
    const cal=D('');cal.style.cssText='display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-bottom:10px';
    ['S','M','T','W','T','F','S'].forEach(d=>cal.appendChild(h('div',{style:'font-size:9px;color:#8a7260;font-weight:800;text-align:center;padding-bottom:2px'},d)));
    const padStart=cycle.start.getDay(),padEnd=(7-((padStart+chart.length)%7))%7;
    for(let i=0;i<padStart;i++){const blank=D('');blank.style.cssText='min-height:68px;border-radius:7px;background:#faf6f1;border:1px solid transparent';cal.appendChild(blank);}
    chart.forEach(cd=>{
      const isT=cd.ds===toStr(),dt=dtOf(cd.ds),intensity=Math.min(1,cd.cost/maxCost),cell=D('');
      cell.style.cssText=`min-height:68px;border:1px solid ${isT?'#b8720c':'#e2d9ce'};background:${cd.cost>0?`rgba(27,77,53,${0.04+intensity*.08})`:'#fff'};border-radius:7px;padding:5px 4px;display:flex;flex-direction:column;gap:3px;overflow:hidden`;
      const top=D('row');top.style.cssText='align-items:flex-start;gap:2px';
      top.appendChild(h('span',{style:`font-size:11px;font-weight:800;color:${isT?'#b8720c':'#3a2818'}`},String(dt.getDate())));
      top.appendChild(h('span',{style:'font-size:7px;color:#8a7260;white-space:nowrap'},dt.toLocaleDateString('en-PH',{month:'short'})));
      cell.appendChild(top);
      cell.appendChild(h('div',{style:'font-size:9px;font-weight:700;color:#3a2818;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},cd.meralcoDailyKwh?`${cd.kwh.toFixed(1)} kWh`:fmt2(cd.cost)));
      cell.appendChild(h('div',{style:'font-size:7.5px;color:#8a7260;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},cd.meralcoDailyKwh?fmt2(cd.cost):`${cd.kwh.toFixed(2)} kWh`));
      const strip=D('');strip.style.cssText='height:5px;background:#ede6dc;border-radius:3px;overflow:hidden;display:flex;margin-top:auto';
      const total=Math.max(cd.airCost+cd.tvCost+cd.applianceCost,0);
      if(total>0){
        const airSeg=D('');airSeg.style.cssText=`width:${(cd.airCost/total*100).toFixed(1)}%;background:#b8720c`;strip.appendChild(airSeg);
        const tvSeg=D('');tvSeg.style.cssText=`width:${(cd.tvCost/total*100).toFixed(1)}%;background:#2e6e4f`;strip.appendChild(tvSeg);
        const apSeg=D('');apSeg.style.cssText=`width:${(cd.applianceCost/total*100).toFixed(1)}%;background:#1a56c4`;strip.appendChild(apSeg);
      }
      cell.appendChild(strip);cal.appendChild(cell);
    });
    for(let i=0;i<padEnd;i++){const blank=D('');blank.style.cssText='min-height:68px;border-radius:7px;background:#faf6f1;border:1px solid transparent';cal.appendChild(blank);}
    c.appendChild(cal);
    const legend=D('');legend.style.cssText='font-size:10px;color:#8a7260;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px';
    legend.appendChild(h('span',{},'■ Aircon'));legend.lastChild.style.color='#b8720c';
    legend.appendChild(h('span',{},'■ TV'));legend.lastChild.style.color='#2e6e4f';
    legend.appendChild(h('span',{},'■ Appliances'));legend.lastChild.style.color='#1a56c4';
    legend.appendChild(h('span',{style:'color:#8a7260'},meralcoKwh?'Top labels show kWh/day':'Top labels show cost/day'));
    c.appendChild(legend);
    c.appendChild(Btn('bp bfull','Close',()=>set({modal:null})));
    return M('Full Month Chart',c);
  }
  if(S.modal==='electricityReport'){
    const monthKey=S.chartMonthKey||S.rptMk||curMk(),data=S.data,r=electricityReportForMonth(monthKey,data);
    const c=D('');
    const nav=D('row');nav.style.cssText='gap:8px;margin-bottom:9px';
    const prev=Btn('bgsm','<',()=>set({chartMonthKey:shiftMonthKey(monthKey,-1)}));prev.style.width='36px';
    const next=Btn('bgsm','>',()=>set({chartMonthKey:shiftMonthKey(monthKey,1)}));next.style.width='36px';
    nav.appendChild(prev);nav.appendChild(h('div',{cls:'sf',style:'font-size:16px;flex:1;text-align:center;color:#3a2818'},mklbl(monthKey)));nav.appendChild(next);c.appendChild(nav);
    c.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;text-align:center;margin:-4px 0 9px'},`Meralco cycle ${cycleLabel(r.cycle)}`));
    const hero=D('');hero.style.cssText='background:#f7f3ee;border:1px solid #e2d9ce;border-radius:8px;padding:9px 10px;margin-bottom:8px';
    hero.appendChild(h('div',{cls:'lbl'},'Usage Overview'));
    hero.appendChild(h('div',{cls:'sf',style:'font-size:24px;color:#3a2818;margin-top:2px'},`${r.totalKwh.toFixed(2)} kWh`));
    hero.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;margin-top:3px'},`${fmt2(r.totalCost)} estimated · ${(r.totalKwh/r.days).toFixed(2)} kWh/day · ${r.logs.length} logged session${r.logs.length!==1?'s':''}`));
    c.appendChild(hero);
    c.appendChild(metricTiles([
      {label:'Aircon',value:`${r.airconKwh.toFixed(2)} kWh`,color:'#b8720c'},
      {label:'TV',value:`${r.tvKwh.toFixed(2)} kWh`,color:'#2e6e4f'},
      {label:'Appliance',value:`${(r.sessionKwh+r.alwaysKwh).toFixed(2)} kWh`,color:'#1a56c4'}
    ]));
    const breakdown=D('card');breakdown.style.marginTop='10px';breakdown.appendChild(DivHdr('Consumption Breakdown'));
    const bp=D('cp'),parts=[
      ['Aircon',r.airconKwh,r.airconCost,'#b8720c'],
      ['TV',r.tvKwh,r.tvCost,'#2e6e4f'],
      ['Appliance Sessions',r.sessionKwh,r.sessionCost,'#6b4c36'],
      ['24/7 Appliances',r.alwaysKwh,r.alwaysCost,'#1a56c4']
    ],max=Math.max(...parts.map(p=>p[1]),1);
    parts.forEach(([label,kwh,cost,color])=>{
      const row=D('rpt-bar-row');
      row.appendChild(h('div',{cls:'rpt-bar-label'},label));
      const track=D('rpt-bar-track'),fill=D('rpt-bar-fill');fill.style.cssText=`width:${(kwh/max*100).toFixed(1)}%;background:${color}`;track.appendChild(fill);
      row.appendChild(track);
      const val=D('rpt-bar-val');val.textContent=`${kwh.toFixed(2)} kWh`;row.appendChild(val);
      bp.appendChild(row);
      bp.appendChild(h('div',{style:'font-size:9.5px;color:#8a7260;text-align:right;margin-top:-4px;margin-bottom:2px'},fmt2(cost)));
    });
    breakdown.appendChild(bp);c.appendChild(breakdown);
    const top=D('card');top.appendChild(DivHdr('Most Consumption'));
    if(r.top.length){
      r.top.slice(0,6).forEach(item=>{
        const row=D('row cr');row.style.cssText='border-bottom:1px solid #e2d9ce;gap:8px';
        const left=D('');left.style.cssText='flex:1;min-width:0';
        left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},item.name));
        left.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},`${item.type} · ${item.logs?item.logs+' log'+(item.logs!==1?'s':''):'24/7'}${item.hours?` · ${durationLabel(item.hours*60)}`:''}`));
        const right=D('');right.style.cssText='text-align:right;flex-shrink:0';
        right.appendChild(h('div',{cls:'sf',style:'font-size:14px'},`${item.kwh.toFixed(2)} kWh`));
        right.appendChild(h('div',{style:'font-size:9.5px;color:#8a7260'},fmt2(item.cost)));
        row.appendChild(left);row.appendChild(right);top.appendChild(row);
      });
    }else top.appendChild(Object.assign(D('empty'),{textContent:'No electricity usage logs for this month.'}));
    c.appendChild(top);
    const recent=D('card');recent.appendChild(DivHdr('Recent Usage Logs'));
    if(r.logs.length){
      r.logs.slice(0,8).forEach(log=>{
        const row=D('row cr');row.style.cssText='border-bottom:1px solid #e2d9ce;gap:8px';
        const left=D('');left.style.cssText='flex:1;min-width:0';
        left.appendChild(h('div',{style:'font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},`${log.type} · ${log.name}`));
        left.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},`${new Date(log.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}${log.time?' · '+log.time:''}`));
        row.appendChild(left);
        row.appendChild(h('div',{cls:'sf',style:'font-size:13px;flex-shrink:0'},`${(parseFloat(log.kwh)||0).toFixed(3)} kWh`));
        recent.appendChild(row);
      });
    }else recent.appendChild(Object.assign(D('empty'),{textContent:'No session logs yet. 24/7 appliances are still included above.'}));
    c.appendChild(recent);
    c.appendChild(Btn('bp bfull','Close',()=>set({modal:null})));
    return M('Electricity Usage Report',c);
  }
  if(S.modal==='foodReport'){
    const monthKey=S.chartMonthKey||S.rptMk||curMk(),data=S.data;
    const food=(data.transactions||[]).filter(t=>mk(t.date)===monthKey),paid=food.filter(t=>!isHomeCookedTx(t)),mealLogs=food.filter(isHomeCookedTx),groceries=paid.filter(isGroceryTx),meals=paid.filter(t=>!isGroceryTx(t));
    const total=paid.reduce((s,t)=>s+t.amount,0),mealTotal=meals.reduce((s,t)=>s+t.amount,0),groceryTotal=groceries.reduce((s,t)=>s+t.amount,0);
    const c=D('');
    const nav=D('row');nav.style.cssText='gap:8px;margin-bottom:9px';
    const prev=Btn('bgsm','<',()=>set({chartMonthKey:shiftMonthKey(monthKey,-1)}));prev.style.width='36px';
    const next=Btn('bgsm','>',()=>set({chartMonthKey:shiftMonthKey(monthKey,1)}));next.style.width='36px';
    nav.appendChild(prev);nav.appendChild(h('div',{cls:'sf',style:'font-size:16px;flex:1;text-align:center;color:#3a2818'},mklbl(monthKey)));nav.appendChild(next);c.appendChild(nav);
    const hero=D('');hero.style.cssText='background:#f7f3ee;border:1px solid #e2d9ce;border-radius:8px;padding:9px 10px;margin-bottom:8px';
    hero.appendChild(h('div',{cls:'lbl'},'Food Overview'));
    hero.appendChild(h('div',{cls:'sf',style:'font-size:24px;color:#3a2818;margin-top:2px'},fmt(total)));
    hero.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;margin-top:3px'},`${paid.length} paid log${paid.length!==1?'s':''} · ${mealLogs.length} meal log${mealLogs.length!==1?'s':''} · ${fmt(Math.round(total/Math.max(1,[...new Set(paid.map(t=>t.date))].length)))}/active day`));
    c.appendChild(hero);
    c.appendChild(metricTiles([
      {label:'Meals',value:fmt(mealTotal),color:'#2e6e4f'},
      {label:'Groceries',value:fmt(groceryTotal),color:groceryTotal>(data.groceryBudget||5000)?'#b83030':'#1a56c4'},
      {label:'Meal Logs',value:String(mealLogs.length),color:'#b8720c'}
    ]));
    const bySrc=paid.reduce((acc,t)=>{acc[t.source]=(acc[t.source]||0)+t.amount;return acc;},{});
    const srcCard=D('card');srcCard.style.marginTop='10px';srcCard.appendChild(DivHdr('Spending by Source'));
    const sp=D('cp'),maxSrc=Math.max(...Object.values(bySrc),1);
    Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).forEach(([src,amt])=>{
      const row=D('rpt-bar-row');row.appendChild(h('div',{cls:'rpt-bar-label'},src));
      const track=D('rpt-bar-track'),fill=D('rpt-bar-fill');fill.style.cssText=`width:${(amt/maxSrc*100).toFixed(1)}%;background:#2e6e4f`;track.appendChild(fill);
      row.appendChild(track);row.appendChild(h('div',{cls:'rpt-bar-val'},fmt(amt)));sp.appendChild(row);
    });
    if(!Object.keys(bySrc).length)sp.appendChild(Object.assign(D('empty'),{textContent:'No paid food expenses this month.'}));
    srcCard.appendChild(sp);c.appendChild(srcCard);
    const mealCard=D('card');mealCard.appendChild(DivHdr('Meal Logs'));
    if(mealLogs.length){
      mealLogs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).forEach(t=>{
        const row=D('row cr');row.style.cssText='border-bottom:1px solid #e2d9ce;gap:8px';
        const left=D('');left.style.cssText='flex:1;min-width:0';
        left.appendChild(h('div',{style:'font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},`Home-cooked${t.note?' · '+t.note:''}`));
        left.appendChild(h('div',{style:'font-size:10px;color:#8a7260'},new Date(t.date+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})));
        row.appendChild(left);mealCard.appendChild(row);
      });
    }else mealCard.appendChild(Object.assign(D('empty'),{textContent:'No Home-cooked meal logs this month.'}));
    c.appendChild(mealCard);
    c.appendChild(Btn('bp bfull','Close',()=>set({modal:null})));
    return M('Food Report',c);
  }
  if(S.modal==='homeReport'){
    const monthKey=S.chartMonthKey||S.rptMk||curMk(),data=S.data,items=(data.homeExpenses||[]).filter(e=>mk(e.date)===monthKey);
    const total=items.reduce((s,e)=>s+e.amount,0),count=items.length,byCat=items.reduce((acc,e)=>{acc[e.category]=(acc[e.category]||0)+e.amount;return acc;},{}),byStore=items.reduce((acc,e)=>{acc[e.store||'Unknown']=(acc[e.store||'Unknown']||0)+e.amount;return acc;},{});
    const c=D('');
    const nav=D('row');nav.style.cssText='gap:8px;margin-bottom:9px';
    const prev=Btn('bgsm','<',()=>set({chartMonthKey:shiftMonthKey(monthKey,-1)}));prev.style.width='36px';
    const next=Btn('bgsm','>',()=>set({chartMonthKey:shiftMonthKey(monthKey,1)}));next.style.width='36px';
    nav.appendChild(prev);nav.appendChild(h('div',{cls:'sf',style:'font-size:16px;flex:1;text-align:center;color:#3a2818'},mklbl(monthKey)));nav.appendChild(next);c.appendChild(nav);
    const hero=D('');hero.style.cssText='background:#f7f3ee;border:1px solid #e2d9ce;border-radius:8px;padding:9px 10px;margin-bottom:8px';
    hero.appendChild(h('div',{cls:'lbl'},'Home Overview'));
    hero.appendChild(h('div',{cls:'sf',style:'font-size:24px;color:#3a2818;margin-top:2px'},fmt(total)));
    hero.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260;margin-top:3px'},`${count} item${count!==1?'s':''} · Avg ${fmt(Math.round(total/Math.max(1,count)))}/item`));
    c.appendChild(hero);
    const catCard=D('card');catCard.appendChild(DivHdr('Spending by Category'));
    const cp=D('cp'),maxCat=Math.max(...Object.values(byCat),1);
    Object.entries(byCat).sort((a,b)=>b[1]-a[1]).forEach(([cat,amt])=>{
      const row=D('rpt-bar-row');row.appendChild(h('div',{cls:'rpt-bar-label'},cat));
      const track=D('rpt-bar-track'),fill=D('rpt-bar-fill');fill.style.cssText=`width:${(amt/maxCat*100).toFixed(1)}%;background:#1a56c4`;track.appendChild(fill);
      row.appendChild(track);row.appendChild(h('div',{cls:'rpt-bar-val'},fmt(amt)));cp.appendChild(row);
    });
    if(!items.length)cp.appendChild(Object.assign(D('empty'),{textContent:'No home expenses this month.'}));
    catCard.appendChild(cp);c.appendChild(catCard);
    const storeCard=D('card');storeCard.appendChild(DivHdr('Top Stores'));
    const stp=D('cp'),maxStore=Math.max(...Object.values(byStore),1);
    Object.entries(byStore).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([store,amt])=>{
      const row=D('rpt-bar-row');row.appendChild(h('div',{cls:'rpt-bar-label'},store));
      const track=D('rpt-bar-track'),fill=D('rpt-bar-fill');fill.style.cssText=`width:${(amt/maxStore*100).toFixed(1)}%;background:#2e6e4f`;track.appendChild(fill);
      row.appendChild(track);row.appendChild(h('div',{cls:'rpt-bar-val'},fmt(amt)));stp.appendChild(row);
    });
    storeCard.appendChild(stp);c.appendChild(storeCard);
    c.appendChild(Btn('bp bfull','Close',()=>set({modal:null})));
    return M('Home Report',c);
  }
  if(S.modal==='addTx'){
    const c=D('');
    const isHomeCooked=S.txF.source==='Home-cooked';
    if(!isHomeCooked){
      const ai=Inp('',{type:'number',inputmode:'decimal',placeholder:'e.g. 150',value:S.txF.amount});ai.oninput=e=>S.txF.amount=e.target.value;setTimeout(()=>ai.focus(),50);
      c.appendChild(Fg('Subtotal (₱)',ai));
      const dii=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional',value:S.txF.discount});dii.oninput=e=>S.txF.discount=e.target.value;c.appendChild(Fg('Discount (₱)',dii));
    }
    c.appendChild(Fg('Source',Sel(S.txF.source,foodSources(),v=>{S.txF.source=v;if(v==='Home-cooked'){S.txF.amount='';S.txF.discount='';}render();})));
    const isGroceries=S.txF.source==='Groceries';
    const ni=Inp('',{type:'text',placeholder:isGroceries?'e.g. Eggs, bread, chips':isHomeCooked?'e.g. Pork sinigang, rice':'e.g. Pork sinigang',value:S.txF.note});ni.oninput=e=>S.txF.note=e.target.value;c.appendChild(Fg(isGroceries?'Pantry Item Name':isHomeCooked?'What did you eat?':'Notes (optional)',ni,isHomeCooked?'Required for no-expense meal logs.':''));
    if(isGroceries){
      const g2=D('g2');
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',value:S.txF.qty||'1'});qi.oninput=e=>S.txF.qty=e.target.value;qfg.appendChild(qi);g2.appendChild(qfg);
      const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(S.txF.unit||'pcs',UNITS,v=>S.txF.unit=v));g2.appendChild(ufg);c.appendChild(g2);
      c.appendChild(Fg('Pantry Category',Sel(S.txF.stockCategory||'Food Staples',SCATS,v=>S.txF.stockCategory=v),'This grocery will also be added to Pantry & Stocks.'));
    }
    const di=Inp('',{type:'date',value:S.txF.date});di.oninput=e=>S.txF.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save',addTx);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log Food Expense',c);
  }
  if(S.modal==='addHome'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Dish soap, Shampoo',value:S.homeF.name});ni.oninput=e=>S.homeF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
    const calc=()=>{const gross=(parseFloat(S.homeF.unitPrice)||0)*(parseFloat(S.homeF.qty)||1),discount=Math.max(0,parseFloat(S.homeF.discount)||0),total=Math.max(0,gross-discount);S.homeF.amount=total?total.toFixed(2):'';ti.value=S.homeF.amount;};
    const g2=D('g2');
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',value:S.homeF.qty});qi.oninput=e=>{S.homeF.qty=e.target.value;calc();};qfg.appendChild(qi);g2.appendChild(qfg);
    const upfg=D('fg');upfg.appendChild(h('label',{cls:'fl'},'Unit Price (₱)'));const ui=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.homeF.unitPrice});ui.oninput=e=>{S.homeF.unitPrice=e.target.value;calc();};upfg.appendChild(ui);g2.appendChild(upfg);c.appendChild(g2);
    c.appendChild(Fg('Unit',Sel(S.homeF.unit,UNITS,v=>S.homeF.unit=v)));
    const df=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional',value:S.homeF.discount});df.oninput=e=>{S.homeF.discount=e.target.value;calc();};c.appendChild(Fg('Discount (₱)',df));
    const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.homeF.amount,readonly:true});c.appendChild(Fg('Total (₱)',ti));
    c.appendChild(Fg('Category',Sel(S.homeF.category,homeCategories(),v=>S.homeF.category=v)));c.appendChild(Fg('Store',Sel(S.homeF.store,homeStores(),v=>S.homeF.store=v)));
    const ot=Inp('',{type:'text',placeholder:'Optional',value:S.homeF.note});ot.oninput=e=>S.homeF.note=e.target.value;c.appendChild(Fg('Notes',ot));
    const di=Inp('',{type:'date',value:S.homeF.date});di.oninput=e=>S.homeF.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save',addHome);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log Home / Toiletries',c);
  }
  if(S.modal==='addPrice'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Galunggong, Shampoo',value:S.priceF.name});ni.oninput=e=>S.priceF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
    const g2=D('g2');
    const pfg=D('fg');pfg.appendChild(h('label',{cls:'fl'},'Price (₱)'));const pi=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.priceF.price});pi.oninput=e=>S.priceF.price=e.target.value;pfg.appendChild(pi);g2.appendChild(pfg);
    const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(S.priceF.unit,UNITS,v=>S.priceF.unit=v));g2.appendChild(ufg);c.appendChild(g2);
    const catSel=Sel(S.priceF.category,['Food','Home & Toiletries'],v=>{S.priceF.category=v;S.priceF.subcat=v==='Food'?FCATS[0]:homeCategories()[0];render();});c.appendChild(Fg('Category',catSel));
    c.appendChild(Fg('Subcategory',Sel(S.priceF.subcat,S.priceF.category==='Food'?FCATS:homeCategories(),v=>S.priceF.subcat=v)));
    c.appendChild(Fg('Store',Sel(S.priceF.store,homeStores(),v=>S.priceF.store=v)));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save Price',addPrice);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Price',c);
  }
  if(S.modal==='addStock'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Rice, eggs, shampoo, dishwashing',value:S.stockF.name});ni.oninput=e=>S.stockF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
    c.appendChild(Fg('Category',Sel(S.stockF.category,SCATS,v=>S.stockF.category=v)));
    const g2=D('g2');
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Current Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.stockF.quantity});qi.oninput=e=>S.stockF.quantity=e.target.value;qfg.appendChild(qi);g2.appendChild(qfg);
    const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(S.stockF.unit,UNITS,v=>S.stockF.unit=v));g2.appendChild(ufg);c.appendChild(g2);
    const mfg=D('fg');mfg.appendChild(h('label',{cls:'fl'},'Min Qty (alert below this)'));const mi=Inp('',{type:'number',inputmode:'decimal',placeholder:'1',value:S.stockF.minQty});mi.oninput=e=>S.stockF.minQty=e.target.value;mfg.appendChild(mi);c.appendChild(mfg);
    const nt=Inp('',{type:'text',placeholder:'e.g. Buy at Palengke',value:S.stockF.note});nt.oninput=e=>S.stockF.note=e.target.value;c.appendChild(Fg('Notes (optional)',nt));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Add Item',addStock);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Pantry Item',c);
  }
  if(S.modal==='addBill'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Water, Phone Plan',value:S.billF.name});ni.oninput=e=>S.billF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Bill Name',ni));
    c.appendChild(h('p',{style:'font-size:11.5px;color:#8a7260;margin-bottom:12px;line-height:1.5'},'You\'ll enter the amount each month since bills change.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Add',addBill);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Bill',c);
  }
  if(S.modal==='editBal'){
    const c=D('');
    const bi=Inp('',{type:'number',inputmode:'decimal',value:S.balInput});bi.oninput=e=>S.balInput=e.target.value;setTimeout(()=>bi.focus(),50);c.appendChild(Fg('Balance (₱)',bi));
    c.appendChild(h('p',{style:'font-size:11.5px;color:#8a7260;margin-bottom:12px;line-height:1.5'},'Set to your actual bank/wallet balance.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Update',updBal);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Update Balance',c);
  }
  if(S.modal==='addAircon'){
    const c=D('');
    const di=Inp('',{type:'date',value:S.airconF.date});di.oninput=e=>S.airconF.date=e.target.value;c.appendChild(Fg('Date',di));
    const g2=D('g2');
    const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(S.airconF.start,v=>S.airconF.start=v));g2.appendChild(sfg);
    const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(S.airconF.end,v=>S.airconF.end=v));g2.appendChild(efg);c.appendChild(g2);
    c.appendChild(Fg('Mode',Sel(airconModeLabel(S.airconF.mode,S.airconF.sleepMode),AIRCON_MODES,v=>{S.airconF.mode=v.toLowerCase();S.airconF.sleepMode=S.airconF.mode==='sleep';}),'Uses the matching day/night kWh/hr rates from Electricity Config.'));
    const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'e.g. 29',value:S.airconF.tempC||''});ti.oninput=e=>S.airconF.tempC=e.target.value;c.appendChild(Fg('Aircon Set Temp (C)',ti,`Adjusts running kWh after the first hour from a ${S.data.airconTempBaseline||29}C baseline.`));
    const rti=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional, from digital clock',value:S.airconF.roomTemp||''});rti.oninput=e=>S.airconF.roomTemp=e.target.value;c.appendChild(Fg('Current Room Temp (C)',rti,'Saved as context only for now.'));
    const wg=D('g2');
    const otFg=D('fg');otFg.appendChild(h('label',{cls:'fl'},'Outdoor Temp (C)'));const oti=Inp('',{type:'number',inputmode:'decimal',value:S.airconF.outdoorTemp||''});oti.oninput=e=>S.airconF.outdoorTemp=e.target.value;otFg.appendChild(oti);wg.appendChild(otFg);
    const ohFg=D('fg');ohFg.appendChild(h('label',{cls:'fl'},'Humidity %'));const ohi=Inp('',{type:'number',inputmode:'decimal',value:S.airconF.outdoorHumidity||''});ohi.oninput=e=>S.airconF.outdoorHumidity=e.target.value;ohFg.appendChild(ohi);wg.appendChild(ohFg);c.appendChild(wg);
    const ofi=Inp('',{type:'number',inputmode:'decimal',value:S.airconF.outdoorFeels||''});ofi.oninput=e=>S.airconF.outdoorFeels=e.target.value;c.appendChild(Fg('Feels Like (C)',ofi,'Outdoor temp affects running kWh lightly. Values auto-fill from Open-Meteo when available.'));
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`Uses your editable config rates. After the first ${durationLabel(60)}, the estimate switches by mode and day/night time.`));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';
    const st=Btn('bg','Start Timer',()=>{startActiveSession('aircon',{mode:S.airconF.mode,sleepMode:S.airconF.sleepMode,tempC:S.airconF.tempC,roomTemp:S.airconF.roomTemp,outdoorTemp:S.airconF.outdoorTemp,outdoorFeels:S.airconF.outdoorFeels,outdoorHumidity:S.airconF.outdoorHumidity});set({modal:null});});st.style.flex='1.4';
    const sa=Btn('bp','Log Usage',addAircon);sa.style.flex='1.6';c.appendChild(Mr(ca,st,sa));return M('Log Aircon Usage',c);
  }
  if(S.modal==='addTv'){
    const c=D('');
    const di=Inp('',{type:'date',value:S.tvF.date});di.oninput=e=>S.tvF.date=e.target.value;c.appendChild(Fg('Date',di));
    const g2=D('g2');
    const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(S.tvF.start,v=>S.tvF.start=v));g2.appendChild(sfg);
    const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(S.tvF.end,v=>S.tvF.end=v));g2.appendChild(efg);c.appendChild(g2);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`Uses ${S.data.tvWatts||175}W from Electricity Config.`));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';
    const st=Btn('bg','Start Timer',()=>{startActiveSession('tv');set({modal:null});});st.style.flex='1.4';
    const sa=Btn('bp','Log TV',addTv);sa.style.flex='1.6';c.appendChild(Mr(ca,st,sa));return M('Log TV Usage',c);
  }
  if(S.modal==='logAppliance'){
    const c=D('');
    const sessionApps=(S.data.appliances||[]).filter(a=>!a.alwaysOn);
    if(!sessionApps.length){
      c.appendChild(h('p',{style:'font-size:12px;color:#8a7260;line-height:1.5;margin-bottom:12px'},'Add a session appliance first, then you can log usage here.'));
      c.appendChild(Btn('bp bfull','Add Appliance',()=>set({modal:'addAppliance'})));
      return M('Log Appliance Session',c);
    }
    const selected=sessionApps.find(a=>a.id===S.applianceSessionF.applianceId)||sessionApps[0];
    if(!S.applianceSessionF.applianceId)S.applianceSessionF.applianceId=selected.id;
    c.appendChild(Fg('Appliance',Sel(S.applianceSessionF.applianceId,sessionApps.map(a=>a.id),v=>{
      const ap=sessionApps.find(a=>a.id===v),start=S.applianceSessionF.start||timeOf(new Date()),mins=parseFloat(ap?.sessionMinutes)||60;
      S.applianceSessionF.applianceId=v;S.applianceSessionF.start=start;S.applianceSessionF.end=timePlus(start,mins);S.applianceSessionF.minutes=String(mins);render();
    })));
    c.lastChild.querySelector('select').querySelectorAll('option').forEach(op=>{const ap=sessionApps.find(a=>a.id===op.value);if(ap)op.textContent=ap.name;});
    const di=Inp('',{type:'date',value:S.applianceSessionF.date});di.oninput=e=>S.applianceSessionF.date=e.target.value;c.appendChild(Fg('Date',di));
    if(!S.applianceSessionF.start)S.applianceSessionF.start=timeOf(new Date());
    if(!S.applianceSessionF.end)S.applianceSessionF.end=timePlus(S.applianceSessionF.start,selected.sessionMinutes||60);
    const g2=D('g2');
    const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(S.applianceSessionF.start,v=>S.applianceSessionF.start=v));g2.appendChild(sfg);
    const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(S.applianceSessionF.end,v=>S.applianceSessionF.end=v));g2.appendChild(efg);c.appendChild(g2);
    const minutes=minutesBetween(S.applianceSessionF.start,S.applianceSessionF.end)||selected.sessionMinutes||0;
    S.applianceSessionF.minutes=String(minutes);
    const est=applianceSessionEstimate(selected,minutes,S.data.meralcoRate);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`Estimated session: ${durationLabel(minutes)} · ${est.kwh.toFixed(3)} kWh · ${fmt2(est.cost)}. Default ${durationLabel(selected.sessionMinutes||60)}/session.`));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';
    const st=Btn('bg','Start Timer',()=>{startActiveSession('appliance',{applianceId:selected.id});set({modal:null});});st.style.flex='1.4';
    const sa=Btn('bp','Log Session',addApplianceUsage);sa.style.flex='1.6';c.appendChild(Mr(ca,st,sa));return M('Log Appliance Session',c);
  }
  if(S.modal==='addAppliance'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Rice cooker, LED bulb',value:S.applianceF.name});ni.oninput=e=>S.applianceF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Appliance Name',ni));
    c.appendChild(Fg('Category',Sel(S.applianceF.category,applianceCategories(),v=>S.applianceF.category=v)));
    const g1=D('g2');
    const wfg=D('fg');wfg.appendChild(h('label',{cls:'fl'},'Watts'));const wi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'e.g. 60',value:S.applianceF.watts});wi.oninput=e=>S.applianceF.watts=e.target.value;wfg.appendChild(wi);g1.appendChild(wfg);
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'1',value:S.applianceF.qty});qi.oninput=e=>S.applianceF.qty=e.target.value;qfg.appendChild(qi);g1.appendChild(qfg);c.appendChild(g1);
    const ar=D('row');ar.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
    const cb=h('input',{type:'checkbox',checked:S.applianceF.alwaysOn,style:'width:18px;height:18px'});cb.onchange=e=>{S.applianceF.alwaysOn=e.target.checked;render();};
    ar.appendChild(cb);ar.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Runs 24/7'));c.appendChild(ar);
    if(!S.applianceF.alwaysOn){
      const sm=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'e.g. 30',value:S.applianceF.sessionMinutes});sm.oninput=e=>S.applianceF.sessionMinutes=e.target.value;c.appendChild(Fg('Default Minutes / Session',sm,`Used when logging sessions. ${durationLabel(S.applianceF.sessionMinutes||60)} by default.`));
    }
    const nt=Inp('',{type:'text',placeholder:'Optional notes',value:S.applianceF.note});nt.oninput=e=>S.applianceF.note=e.target.value;c.appendChild(Fg('Notes',nt));
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},S.applianceF.alwaysOn?`24/7 appliances auto-compute monthly using ${fmt(S.data.meralcoRate)}/kWh.`:'Session appliances only count when you log a usage session.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Add Appliance',addAppliance);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Appliance',c);
  }
  if(S.modal==='settings'){
    const c=D(''),f=S.settingsF;
    const gk=Inp('',{type:'password',placeholder:'AIza...',value:f.geminiKey||''});gk.oninput=e=>f.geminiKey=e.target.value;c.appendChild(Fg('Gemini API Key',gk,'Stored only in this browser.'));
    c.appendChild(Fg('Weather Provider',Sel(f.weatherProvider||'open-meteo',['open-meteo'],v=>f.weatherProvider=v),'Open-Meteo does not need an API key.'));
    const wl=Inp('',{type:'text',value:f.weatherLabel||''});wl.oninput=e=>f.weatherLabel=e.target.value;c.appendChild(Fg('Location Label',wl));
    const g1=D('g2');
    const latFg=D('fg');latFg.appendChild(h('label',{cls:'fl'},'Latitude'));const lati=Inp('',{type:'number',inputmode:'decimal',step:'0.00001',value:f.weatherLat});lati.oninput=e=>f.weatherLat=e.target.value;latFg.appendChild(lati);g1.appendChild(latFg);
    const lonFg=D('fg');lonFg.appendChild(h('label',{cls:'fl'},'Longitude'));const loni=Inp('',{type:'number',inputmode:'decimal',step:'0.00001',value:f.weatherLon});loni.oninput=e=>f.weatherLon=e.target.value;lonFg.appendChild(loni);g1.appendChild(lonFg);c.appendChild(g1);
    const g2=D('g2');
    const elFg=D('fg');elFg.appendChild(h('label',{cls:'fl'},'Elevation (m)'));const eli=Inp('',{type:'number',inputmode:'decimal',step:'0.1',value:f.weatherElevation});eli.oninput=e=>f.weatherElevation=e.target.value;elFg.appendChild(eli);g2.appendChild(elFg);
    const wkFg=D('fg');wkFg.appendChild(h('label',{cls:'fl'},'Weather API Key'));const wki=Inp('',{type:'password',placeholder:'Optional',value:f.weatherApiKey||''});wki.oninput=e=>f.weatherApiKey=e.target.value;wkFg.appendChild(wki);g2.appendChild(wkFg);c.appendChild(g2);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},'Default coordinates are 14.46139, 120.97306 for Las Pinas. Outdoor weather is fetched from Open-Meteo and saved with aircon sessions.'));
    const pref=Btn('bgfull','Lists & Defaults',openListsDefaults);pref.style.marginBottom='10px';c.appendChild(pref);
    const rf=Btn('bg','Refresh Weather',()=>updateWeather(true));rf.style.flex='1.2';
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';
    const sa=Btn('bp','Save',saveSettings);sa.style.flex='1.6';c.appendChild(Mr(ca,rf,sa));return M('Settings',c);
  }
  if(S.modal==='airSet'){
    const c=D('');
    const ri=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.rate});ri.oninput=e=>S.airSetF.rate=e.target.value;c.appendChild(Fg('Meralco Rate (₱/kWh)',ri));
    const rdi=Inp('',{type:'number',inputmode:'numeric',min:'1',max:'31',value:S.airSetF.readDay||12});rdi.oninput=e=>S.airSetF.readDay=e.target.value;c.appendChild(Fg('Meter Read Day',rdi,'Your cycle starts the next day and ends on this day. Example: 12 means Apr 13-May 12.'));
    c.appendChild(Fg('Default Aircon Mode',Sel(airconModeLabel(S.airSetF.defaultMode,S.airSetF.defaultSleep),AIRCON_MODES,v=>{S.airSetF.defaultMode=v.toLowerCase();S.airSetF.defaultSleep=S.airSetF.defaultMode==='sleep';}),'Used by Start Aircon and new manual aircon sessions.'));
    const gA=D('g2');
    const stfg=D('fg');stfg.appendChild(h('label',{cls:'fl'},'Initial kWh/hr'));const sti=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.startup});sti.oninput=e=>S.airSetF.startup=e.target.value;stfg.appendChild(sti);gA.appendChild(stfg);
    const sdFg=D('fg');sdFg.appendChild(h('label',{cls:'fl'},'Sleep Day'));const sdi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.sleepDay});sdi.oninput=e=>S.airSetF.sleepDay=e.target.value;sdFg.appendChild(sdi);gA.appendChild(sdFg);
    c.appendChild(gA);
    const gB=D('g2');
    const snFg=D('fg');snFg.appendChild(h('label',{cls:'fl'},'Sleep Night'));const sni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.sleepNight});sni.oninput=e=>S.airSetF.sleepNight=e.target.value;snFg.appendChild(sni);gB.appendChild(snFg);
    const edFg=D('fg');edFg.appendChild(h('label',{cls:'fl'},'Eco Day'));const edi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.ecoDay});edi.oninput=e=>S.airSetF.ecoDay=e.target.value;edFg.appendChild(edi);gB.appendChild(edFg);
    c.appendChild(gB);
    const gC=D('g2');
    const enFg=D('fg');enFg.appendChild(h('label',{cls:'fl'},'Eco Night'));const eni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.ecoNight});eni.oninput=e=>S.airSetF.ecoNight=e.target.value;enFg.appendChild(eni);gC.appendChild(enFg);
    const dFg=D('fg');dFg.appendChild(h('label',{cls:'fl'},'Normal Day'));const dni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.day});dni.oninput=e=>S.airSetF.day=e.target.value;dFg.appendChild(dni);gC.appendChild(dFg);
    c.appendChild(gC);
    const gD=D('g2');
    const nFg=D('fg');nFg.appendChild(h('label',{cls:'fl'},'Normal Night'));const nni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.night});nni.oninput=e=>S.airSetF.night=e.target.value;nFg.appendChild(nni);
    const tFg=D('fg');tFg.appendChild(h('label',{cls:'fl'},'Default Set Temp (C)'));const dti=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.defaultTemp});dti.oninput=e=>S.airSetF.defaultTemp=e.target.value;tFg.appendChild(dti);
    gD.appendChild(nFg);gD.appendChild(tFg);c.appendChild(gD);
    const gE=D('g2');
    const tbFg=D('fg');tbFg.appendChild(h('label',{cls:'fl'},'Temp Baseline (C)'));const tbi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.tempBaseline||29});tbi.oninput=e=>S.airSetF.tempBaseline=e.target.value;tbFg.appendChild(tbi);gE.appendChild(tbFg);
    const tsFg=D('fg');tsFg.appendChild(h('label',{cls:'fl'},'Temp Step % / C'));const tsi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.tempStep||7});tsi.oninput=e=>S.airSetF.tempStep=e.target.value;tsFg.appendChild(tsi);gE.appendChild(tsFg);
    c.appendChild(gE);
    const gF=D('g2');
    const obFg=D('fg');obFg.appendChild(h('label',{cls:'fl'},'Outdoor Baseline (C)'));const obi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.outdoorBaseline||30});obi.oninput=e=>S.airSetF.outdoorBaseline=e.target.value;obFg.appendChild(obi);gF.appendChild(obFg);
    const osFg=D('fg');osFg.appendChild(h('label',{cls:'fl'},'Outdoor Step % / C'));const osi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.outdoorStep||2.5});osi.oninput=e=>S.airSetF.outdoorStep=e.target.value;osFg.appendChild(osi);gF.appendChild(osFg);
    c.appendChild(gF);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;margin-bottom:12px;line-height:1.55'},`${AIRCON_MODEL_PROFILE.model} profile: about ${AIRCON_MODEL_PROFILE.ratedWatts}W rated, ${AIRCON_MODEL_PROFILE.minWatts}-${AIRCON_MODEL_PROFILE.maxWatts}W inverter range, CSPF ${AIRCON_MODEL_PROFILE.cspf}. Eco is a separate preset beside Sleep and Normal. Set temp and outdoor temp adjust the running side of the estimate while startup tapers during the first hour.`));
    const tvw=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.tvWatts});tvw.oninput=e=>S.airSetF.tvWatts=e.target.value;c.appendChild(Fg('TV Watts',tvw,'Xiaomi TV A Pro 65 2025 official spec: 175W.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save Settings',saveAirSet);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Electricity Config',c);
  }
  if(S.modal==='airconProfile'){
    const c=D(''),p=S.airconProfileF;
    const mi=Inp('',{type:'text',value:p.model||''});mi.oninput=e=>p.model=e.target.value;c.appendChild(Fg('Indoor Model',mi));
    const oi=Inp('',{type:'text',value:p.outdoorModel||''});oi.oninput=e=>p.outdoorModel=e.target.value;c.appendChild(Fg('Outdoor Model',oi));
    const g1=D('g2');
    const ck=D('fg');ck.appendChild(h('label',{cls:'fl'},'Cooling kW'));const cki=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.coolingKw});cki.oninput=e=>p.coolingKw=e.target.value;ck.appendChild(cki);g1.appendChild(ck);
    const rw=D('fg');rw.appendChild(h('label',{cls:'fl'},'Rated Watts'));const rwi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.ratedWatts});rwi.oninput=e=>p.ratedWatts=e.target.value;rw.appendChild(rwi);g1.appendChild(rw);c.appendChild(g1);
    const g2=D('g2');
    const mn=D('fg');mn.appendChild(h('label',{cls:'fl'},'Min Watts'));const mni=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.minWatts});mni.oninput=e=>p.minWatts=e.target.value;mn.appendChild(mni);g2.appendChild(mn);
    const mx=D('fg');mx.appendChild(h('label',{cls:'fl'},'Max Watts'));const mxi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.maxWatts});mxi.oninput=e=>p.maxWatts=e.target.value;mx.appendChild(mxi);g2.appendChild(mx);c.appendChild(g2);
    const g3=D('g2');
    const cf=D('fg');cf.appendChild(h('label',{cls:'fl'},'CSPF'));const cfi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.cspf});cfi.oninput=e=>p.cspf=e.target.value;cf.appendChild(cfi);g3.appendChild(cf);
    const dk=D('fg');dk.appendChild(h('label',{cls:'fl'},'DOE Monthly kWh'));const dki=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:p.doeMonthlyKwh});dki.oninput=e=>p.doeMonthlyKwh=e.target.value;dk.appendChild(dki);g3.appendChild(dk);c.appendChild(g3);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},'These specs describe your aircon profile. Estimate cost still comes from session mode, temp, kWh/hr rates, and Meralco rate.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save Profile',saveAirconProfile);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Edit Aircon Profile',c);
  }
  if(S.modal==='batchEdit'&&S.batchDraft){
    const dr=S.batchDraft,t=S.batchType,c=D('');
    const count=(t==='food'?S.selFood:S.selHome).size;
    c.appendChild(h('p',{style:'font-size:11.5px;color:#8a7260;margin-bottom:12px;line-height:1.5'},`Editing ${count} selected ${t==='food'?'food':'home'} line${count!==1?'s':''}. Blank fields stay unchanged.`));
    if(t==='food'){
      c.appendChild(Fg('Source',Sel('', ['',...foodSources()],v=>{dr.source=v;})));
    }else{
      c.appendChild(Fg('Category',Sel('', ['',...homeCategories()],v=>{dr.category=v;})));
      c.appendChild(Fg('Store',Sel('', ['',...homeStores()],v=>{dr.store=v;})));
    }
    const nt=Inp('',{type:'text',placeholder:'Leave blank to keep existing notes',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
    const di=Inp('',{type:'date',value:dr.date||''});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null,batchType:null,batchDraft:null}));ca.style.flex='1';const sa=Btn('bp','Apply',saveBatchEdit);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Edit Selected',c);
  }
  if(S.modal==='edit'&&S.editDraft){
    const dr=S.editDraft,t=S.editType;
    const c=D('');
    if(t==='food'){
      if(dr.grossAmount===undefined)dr.grossAmount=dr.amount||0;if(dr.discount===undefined)dr.discount=0;
      const isHomeCooked=dr.source==='Home-cooked';
      if(!isHomeCooked){
        const ai=Inp('',{type:'number',inputmode:'decimal',placeholder:'Subtotal',value:dr.grossAmount});ai.oninput=e=>dr.grossAmount=e.target.value;setTimeout(()=>ai.focus(),50);c.appendChild(Fg('Subtotal (₱)',ai));
        const dii=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional',value:dr.discount||''});dii.oninput=e=>dr.discount=e.target.value;c.appendChild(Fg('Discount (₱)',dii));
      }
      c.appendChild(Fg('Source',Sel(dr.source,foodSources(),v=>{dr.source=v;if(v==='Home-cooked'){dr.grossAmount=0;dr.discount=0;dr.amount=0;}render();})));
      const ni=Inp('',{type:'text',placeholder:isHomeCooked?'What did you eat?':'Notes',value:dr.note||''});ni.oninput=e=>dr.note=e.target.value;c.appendChild(Fg(isHomeCooked?'What did you eat?':'Notes',ni));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='home'){
      if(!dr.qty)dr.qty=1;if(!dr.unitPrice)dr.unitPrice=dr.grossAmount||dr.amount||0;if(!dr.unit)dr.unit='pcs';if(dr.discount===undefined)dr.discount=0;
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
      const g2=D('g2');
      const calcHomeEdit=()=>{const total=Math.max(0,(parseFloat(dr.unitPrice)||0)*(parseFloat(dr.qty)||1)-(parseFloat(dr.discount)||0));ai.value=total.toFixed(2);dr.amount=ai.value;};
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',value:dr.qty});qi.oninput=e=>{dr.qty=e.target.value;calcHomeEdit();};qfg.appendChild(qi);g2.appendChild(qfg);
      const upfg=D('fg');upfg.appendChild(h('label',{cls:'fl'},'Unit Price (₱)'));const ui=Inp('',{type:'number',inputmode:'decimal',value:dr.unitPrice});ui.oninput=e=>{dr.unitPrice=e.target.value;calcHomeEdit();};upfg.appendChild(ui);g2.appendChild(upfg);c.appendChild(g2);
      c.appendChild(Fg('Unit',Sel(dr.unit,UNITS,v=>{dr.unit=v;})));
      const df=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional',value:dr.discount||''});df.oninput=e=>{dr.discount=e.target.value;calcHomeEdit();};c.appendChild(Fg('Discount (₱)',df));
      const ai=Inp('',{type:'number',inputmode:'decimal',value:dr.amount,readonly:true});c.appendChild(Fg('Total (₱)',ai));
      c.appendChild(Fg('Category',Sel(dr.category||homeCategories()[0],homeCategories(),v=>{dr.category=v;})));
      c.appendChild(Fg('Store',Sel(dr.store||homeStores()[0],homeStores(),v=>{dr.store=v;})));
      const nt=Inp('',{type:'text',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='aircon'){
      if(!dr.start)dr.start='22:00';if(!dr.end)dr.end=timePlus(dr.start,(parseFloat(dr.hours)||8)*60)||'06:00';dr.mode=airconModeFrom(dr.mode,dr.sleepMode);dr.sleepMode=dr.mode==='sleep';if(dr.tempC===undefined)dr.tempC=S.data.airconDefaultTemp||'29';if(dr.roomTemp===undefined)dr.roomTemp='';
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
      const g2=D('g2');
      const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(dr.start,v=>dr.start=v));g2.appendChild(sfg);
      const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(dr.end,v=>dr.end=v));g2.appendChild(efg);c.appendChild(g2);
      c.appendChild(Fg('Mode',Sel(airconModeLabel(dr.mode,dr.sleepMode),AIRCON_MODES,v=>{dr.mode=v.toLowerCase();dr.sleepMode=dr.mode==='sleep';})));
      const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'e.g. 29',value:dr.tempC||''});ti.oninput=e=>dr.tempC=e.target.value;c.appendChild(Fg('Aircon Set Temp (C)',ti,`Adjusts running kWh after the first hour from a ${S.data.airconTempBaseline||29}C baseline.`));
      const rti=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional, from digital clock',value:dr.roomTemp||''});rti.oninput=e=>dr.roomTemp=e.target.value;c.appendChild(Fg('Current Room Temp (C)',rti,'Saved as context only for now.'));
      const wg=D('g2');
      const otFg=D('fg');otFg.appendChild(h('label',{cls:'fl'},'Outdoor Temp (C)'));const oti=Inp('',{type:'number',inputmode:'decimal',value:dr.outdoorTemp||''});oti.oninput=e=>dr.outdoorTemp=e.target.value;otFg.appendChild(oti);wg.appendChild(otFg);
      const ohFg=D('fg');ohFg.appendChild(h('label',{cls:'fl'},'Humidity %'));const ohi=Inp('',{type:'number',inputmode:'decimal',value:dr.outdoorHumidity||''});ohi.oninput=e=>dr.outdoorHumidity=e.target.value;ohFg.appendChild(ohi);wg.appendChild(ohFg);c.appendChild(wg);
      const ofi=Inp('',{type:'number',inputmode:'decimal',value:dr.outdoorFeels||''});ofi.oninput=e=>dr.outdoorFeels=e.target.value;c.appendChild(Fg('Feels Like (C)',ofi));
    } else if(t==='tv'){
      if(!dr.start)dr.start='19:00';if(!dr.end)dr.end=timePlus(dr.start,(parseFloat(dr.hours)||1)*60)||'22:00';
      const g2=D('g2');
      const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(dr.start,v=>dr.start=v));g2.appendChild(sfg);
      const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(dr.end,v=>dr.end=v));g2.appendChild(efg);c.appendChild(g2);
      const wi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.watts||S.data.tvWatts||175});wi.oninput=e=>dr.watts=e.target.value;c.appendChild(Fg('Watts',wi));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='appliance'){
      if(!dr.qty)dr.qty=1;if(!dr.sessionMinutes&&!dr.alwaysOn)dr.sessionMinutes=Math.max(1,Math.round((parseFloat(dr.hoursPerDay)||1)*60));
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Appliance Name',ni));
      c.appendChild(Fg('Category',Sel(dr.category||'Others',applianceCategories(),v=>{dr.category=v;})));
      const g1=D('g2');
      const wfg=D('fg');wfg.appendChild(h('label',{cls:'fl'},'Watts'));const wi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.watts});wi.oninput=e=>dr.watts=e.target.value;wfg.appendChild(wi);g1.appendChild(wfg);
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.qty});qi.oninput=e=>dr.qty=e.target.value;qfg.appendChild(qi);g1.appendChild(qfg);c.appendChild(g1);
      const ar=D('row');ar.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
      const acb=h('input',{type:'checkbox',checked:dr.alwaysOn,style:'width:18px;height:18px'});acb.onchange=e=>{dr.alwaysOn=e.target.checked;render();};
      ar.appendChild(acb);ar.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Runs 24/7'));c.appendChild(ar);
      if(!dr.alwaysOn){
        const sm=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.sessionMinutes||60});sm.oninput=e=>dr.sessionMinutes=e.target.value;c.appendChild(Fg('Default Minutes / Session',sm,`${durationLabel(dr.sessionMinutes||60)} by default.`));
      }
      const nt=Inp('',{type:'text',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
      const est=applianceMonthly(dr,S.data.meralcoRate);
      const preview=dr.alwaysOn?`Current estimate: ${est.kwh.toFixed(2)} kWh/month · ${fmt2(est.cost)}/month.`:`Per-session estimate (${durationLabel(dr.sessionMinutes||60)}): ${applianceSessionEstimate(dr,dr.sessionMinutes||60,S.data.meralcoRate).kwh.toFixed(3)} kWh · ${fmt2(applianceSessionEstimate(dr,dr.sessionMinutes||60,S.data.meralcoRate).cost)}.`;
      c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},preview));
    } else if(t==='applianceUsage'){
      const sessionApps=(S.data.appliances||[]).filter(a=>!a.alwaysOn);
      if(sessionApps.length){
        c.appendChild(Fg('Appliance',Sel(dr.applianceId||sessionApps[0].id,sessionApps.map(a=>a.id),v=>{
          const ap=sessionApps.find(a=>a.id===v),start=dr.start||'19:00',mins=parseFloat(ap?.sessionMinutes)||parseFloat(dr.minutes)||60;
          dr.applianceId=v;dr.start=start;dr.end=timePlus(start,mins);dr.minutes=mins;render();
        })));
        c.lastChild.querySelector('select').querySelectorAll('option').forEach(op=>{const ap=sessionApps.find(a=>a.id===op.value);if(ap)op.textContent=ap.name;});
      }
      if(!dr.start)dr.start='19:00';if(!dr.end)dr.end=timePlus(dr.start,parseFloat(dr.minutes)||60)||'20:00';
      const g2=D('g2');
      const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(dr.start,v=>dr.start=v));g2.appendChild(sfg);
      const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(dr.end,v=>dr.end=v));g2.appendChild(efg);c.appendChild(g2);
      const previewMinutes=minutesBetween(dr.start,dr.end)||parseFloat(dr.minutes)||0;
      c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`Duration: ${durationLabel(previewMinutes)}.`));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='price'){
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
      const g2=D('g2');
      const pfg=D('fg');pfg.appendChild(h('label',{cls:'fl'},'Price (₱)'));const pi=Inp('',{type:'number',inputmode:'decimal',value:dr.price});pi.oninput=e=>dr.price=e.target.value;pfg.appendChild(pi);g2.appendChild(pfg);
      const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(dr.unit||'pcs',UNITS,v=>{dr.unit=v;}));g2.appendChild(ufg);c.appendChild(g2);
      c.appendChild(Fg('Store',Sel(dr.store||homeStores()[0],homeStores(),v=>{dr.store=v;})));
    } else if(t==='stock'){
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
      c.appendChild(Fg('Category',Sel(dr.category||SCATS[0],SCATS,v=>{dr.category=v;})));
      const g2=D('g2');
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Quantity'));const qi=Inp('',{type:'number',inputmode:'decimal',value:dr.quantity});qi.oninput=e=>dr.quantity=e.target.value;qfg.appendChild(qi);g2.appendChild(qfg);
      const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(dr.unit||'pcs',UNITS,v=>{dr.unit=v;}));g2.appendChild(ufg);c.appendChild(g2);
      const mfg=D('fg');mfg.appendChild(h('label',{cls:'fl'},'Min Qty'));const mi=Inp('',{type:'number',inputmode:'decimal',value:dr.minQty});mi.oninput=e=>dr.minQty=e.target.value;mfg.appendChild(mi);c.appendChild(mfg);
      const nt=Inp('',{type:'text',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
    }
    const ca=Btn('bg','Cancel',()=>set({modal:null,editType:null,editId:null,editDraft:null}));ca.style.flex='1';
    const sa=Btn('bp','Save Changes',saveEdit);sa.style.flex='2';c.appendChild(Mr(ca,sa));
    const labels={food:'Edit Food Expense',home:'Edit Home Expense',aircon:'Edit Aircon Usage',tv:'Edit TV Usage',appliance:'Edit Appliance',applianceUsage:'Edit Appliance Session',price:'Edit Price',stock:'Edit Pantry Item'};
    return M(labels[t]||'Edit',c);
  }
  return null;
}

// ─── MAIN RENDER ─────────────────────────────────────────────
const TABS=[{id:'dash',icon:'🏠',label:'Home'},{id:'food',icon:'🍽️',label:'Food'},{id:'home',icon:'🧴',label:'Home'},{id:'bills',icon:'📋',label:'Bills'},{id:'aircon',icon:'⚡',label:'Electric'},{id:'scan',icon:'📸',label:'Scan'}];
const SCREEN_LABELS={dash:'Overview',food:'Food Expenses',home:'Home & Toiletries',bills:'Bills',prices:'Price Comparison',scan:'AI Scanner',reports:'📊 Reports',stocks:'📦 Pantry & Stocks',aircon:'Electricity Usage',appliances:'Appliance Manager',lists:'Lists & Defaults'};

function render(){
  ensureLiveTick();
  openSw=null;
  const root=document.getElementById('app');root.innerHTML='';
  root.style.background='#f7f3ee';
  const app=D('');app.style.cssText='max-width:480px;margin:0 auto;height:100vh;height:100dvh;background:#f7f3ee;display:flex;flex-direction:column;overflow:hidden';
  // Close swipe on tap outside
  app.addEventListener('touchstart',e=>{if(openSw&&!openSw.contains(e.target)){const c=openSw.querySelector('.swc');if(c){c.style.transition='transform .15s ease';c.style.transform='';}openSw=null;}},{passive:true});
  // Drawer
  app.appendChild(renderDrawer());
  // Header
  const hdr=h('div',{cls:'hdr'});const hrow=h('div',{cls:'hrow'});
  hrow.appendChild(h('button',{cls:'h-menu',onClick:()=>set({drawerOpen:true})},'☰'));
  const hmid=D('h-mid');hmid.appendChild(Object.assign(D('htitle'),{textContent:SCREEN_LABELS[S.tab]||'Budget Tracker'}));hmid.appendChild(Object.assign(D('hsub'),{textContent:'Budget · Prices · Savings'}));
  const hbal=D('h-bal');hbal.appendChild(Object.assign(D('hbl'),{textContent:'Balance'}));hbal.appendChild(Object.assign(D('hbv'),{textContent:fmt(S.data.balance)}));
  hrow.appendChild(hmid);hrow.appendChild(hbal);hdr.appendChild(hrow);app.appendChild(hdr);
  // Content
  let content;
  if(S.tab==='dash')content=renderDash();
  else if(S.tab==='food')content=renderFood();
  else if(S.tab==='home')content=renderHome();
  else if(S.tab==='bills')content=renderBills();
  else if(S.tab==='prices')content=renderPrices();
  else if(S.tab==='scan')content=renderScan();
  else if(S.tab==='aircon')content=renderAircon();
  else if(S.tab==='appliances')content=renderAppliances();
  else if(S.tab==='lists')content=renderListsDefaults();
  else if(S.tab==='reports')content=renderReports();
  else content=renderStocks();
  app.appendChild(content);
  // Tab bar (always visible)
  const tb=D('tabbar');
  TABS.forEach(t=>{
    const on=S.tab===t.id;
    const b=D('tb'+(on?' tb-on':''));
    b.appendChild(Object.assign(D('tb-ic'),{textContent:t.icon}));
    b.appendChild(Object.assign(D('tb-lb'+(on?' tb-lb-on':'')),{textContent:t.label}));
    b.onclick=()=>set({tab:t.id});tb.appendChild(b);
  });
  app.appendChild(tb);
  const modal=renderModal();if(modal)app.appendChild(modal);
  root.appendChild(app);
  ensureWeather();
}

render();
