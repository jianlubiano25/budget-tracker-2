// ─── CONSTANTS ───────────────────────────────────────────────
const SK='ipon-v5', GK='ipon-gkey';
const MODELS=['gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.0-flash-lite','gemini-2.0-flash','gemini-1.5-flash-8b','gemini-1.5-flash'];
const SCAN_PROMPT=`Analyze this image from the Philippines. It may be a receipt, order-details screenshot, price tag, shelf label, palengke sign, or menu.

Extract every visible purchasable line item with a Philippine Peso price. For shopping/order screenshots, match the product name on the left/center with its quantity and price on the right. If a quantity like x30 appears beside a line, return qty:30 and keep price as the visible unit price for one item. The app will compute the total as qty * price.

Return ONLY a raw JSON array, no markdown:
[{"name":"item","price":45.00,"qty":1,"unit":"kg/pcs/pack/etc","store":"infer or Unknown","category":"Food or Home","subcat":"Ulam (Viand) or Vegetables or Rice & Grains or Snacks or Drinks or Condiments & Sauces or Cleaning Supplies or Toiletries & Personal Care or Laundry or Kitchen Supplies or Medicine & First Aid or Others","note":"optional"}]

If no prices found, return: []`;
const FSRC=['Carinderia','Palengke/Home-cooked','Grab/Delivery','Fast Food','Restaurant','Sari-sari store','Others'];
const STORES=['Palengke','Supermarket','Puregold','SM Savemore','Robinsons','Shopee/Lazada','Sari-sari','Others'];
const FCATS=['Ulam (Viand)','Vegetables','Rice & Grains','Snacks','Drinks','Condiments & Sauces','Others'];
const HCATS=['Cleaning Supplies','Toiletries & Personal Care','Laundry','Kitchen Supplies','Bedding & Linen','Medicine & First Aid','Others'];
const SCATS=['Food Staples','Cleaning','Toiletries','Medicine','Condiments','Kitchen','Others'];
const UNITS=['pcs','kg','g','pack','can','bottle','bundle','sachet','box','litre','roll','pair','tali'];
const APPLIANCE_CATS=['Cooling','Kitchen','Network','Security','Computer','Chargers','Lighting','Laundry','Others'];
const DEFAULT_AIRCON_RATES={startup:1.20,sleepDay:0.60,sleepNight:0.42,day:0.85,night:0.55};
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
const fmt3=n=>'₱'+Number(n).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:3});
const stockCatFromHome=cat=>cat==='Cleaning Supplies'?'Cleaning':cat==='Laundry'?'Cleaning':cat==='Toiletries & Personal Care'?'Toiletries':cat==='Medicine & First Aid'?'Medicine':cat==='Kitchen Supplies'?'Kitchen':'Others';
const stockFromHome=(item,id=uid())=>({id,name:item.name,category:stockCatFromHome(item.category),quantity:parseFloat(item.qty)||1,unit:item.unit||'pcs',minQty:0,note:[item.store,item.note].filter(Boolean).join(' · ')});
const toStr=()=>new Date().toISOString().split('T')[0];
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
const pad2=n=>String(n).padStart(2,'0');
const dateOf=dt=>`${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
const timeOf=dt=>`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
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
function isDayMinute(min){const m=((min%1440)+1440)%1440;return m>=360&&m<1080;}
function airconRates(data){
  const d=data||S?.data||{};
  return{
    startup:parseFloat(d.airconStartupRate)||DEFAULT_AIRCON_RATES.startup,
    sleepDay:parseFloat(d.airconSleepDayRate)||DEFAULT_AIRCON_RATES.sleepDay,
    sleepNight:parseFloat(d.airconSleepNightRate)||DEFAULT_AIRCON_RATES.sleepNight,
    day:parseFloat(d.airconDayRate)||DEFAULT_AIRCON_RATES.day,
    night:parseFloat(d.airconNightRate)||DEFAULT_AIRCON_RATES.night
  };
}
function airconRateForMinute(min,sleepMode,rates=airconRates()){const day=isDayMinute(min);return sleepMode?(day?rates.sleepDay:rates.sleepNight):(day?rates.day:rates.night);}
function airconSessionFromMinutes(startMin,totalMinutes,sleepMode,date,start,end,rates=airconRates()){
  const mins=Math.max(1,Math.round(totalMinutes));
  let kwh=Math.min(60,mins)/60*rates.startup;
  for(let i=60;i<mins;i++)kwh+=airconRateForMinute(startMin+i,sleepMode,rates)/60;
  return{date,start,end,sleepMode:!!sleepMode,minutes:mins,hours:mins/60,kwh};
}
function airconSessionFromParts(date,start,end,sleepMode=true,rates=airconRates()){
  const sm=minsOfDay(start),em=minsOfDay(end);if(isNaN(sm)||isNaN(em))return null;
  let total=em-sm;if(total<=0)total+=1440;
  return airconSessionFromMinutes(sm,total,sleepMode,date,start,end,rates);
}
function airconSessionFromDates(startDt,endDt,sleepMode=true,rates=airconRates()){
  const mins=Math.max(1,Math.round((endDt-startDt)/60000));
  let kwh=Math.min(60,mins)/60*rates.startup;
  for(let i=60;i<mins;i++){const dt=new Date(startDt.getTime()+i*60000);kwh+=airconRateForMinute(dt.getHours()*60+dt.getMinutes(),sleepMode,rates)/60;}
  return{date:dateOf(startDt),start:timeOf(startDt),end:timeOf(endDt),sleepMode:!!sleepMode,minutes:mins,hours:mins/60,kwh};
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
  return `${e.qty}x · ${e.watts}W · ${a.alwaysOn?'24/7':`${mins} min/session`}`;
}
function applianceSessionEstimate(appliance,minutes,rate=S?.data?.meralcoRate||14.3345){
  const watts=parseFloat(appliance?.watts)||0,qty=parseFloat(appliance?.qty)||1,mins=parseFloat(minutes)||0;
  const kwh=watts*qty*(mins/60)/1000;
  return{kwh,cost:kwh*rate};
}
const INIT={balance:130000,transactions:[],homeExpenses:[],priceItems:[],stocks:[],bills:[{id:'b1',name:'Electricity',monthlyAmounts:{},paid:{}},{id:'b2',name:'WiFi / Internet',monthlyAmounts:{},paid:{}}],dailyBudget:380,
  airconUsage:[],tvUsage:[],meralcoRate:14.3345,airconStartupKwh:1.2,airconRunningKwh:0.6,
  airconStartupRate:1.20,airconSleepDayRate:0.60,airconSleepNightRate:0.42,airconDayRate:0.85,airconNightRate:0.55,airconDefaultSleepMode:true,airconDefaultTemp:'29',
  tvWatts:175,appliances:DEFAULT_APPLIANCES,applianceUsage:[]};
function ld(){try{const s=localStorage.getItem(SK);if(s){const d=JSON.parse(s);if(!d.stocks)d.stocks=[];if(!d.homeExpenses)d.homeExpenses=[];
  if(!d.airconUsage)d.airconUsage=[];if(!d.tvUsage)d.tvUsage=[];if(!d.meralcoRate||d.meralcoRate===12.03)d.meralcoRate=14.3345;
  if(!d.applianceUsage)d.applianceUsage=[];
  if(!d.appliances)d.appliances=JSON.parse(JSON.stringify(DEFAULT_APPLIANCES));
  d.appliances=(d.appliances||[]).map(a=>({...a,qty:parseFloat(a.qty)||1,sessionMinutes:a.alwaysOn?0:(parseFloat(a.sessionMinutes)||Math.max(1,Math.round((parseFloat(a.hoursPerDay)||1)*60)))}));
  if(!d.airTimer)d.airTimer=null;
  if(!d.airconStartupKwh)d.airconStartupKwh=1.2;if(!d.airconRunningKwh)d.airconRunningKwh=0.6;if(!d.tvWatts||d.tvWatts===100)d.tvWatts=175;
  if(!d.airconStartupRate||d.airconStartupRate===0.75)d.airconStartupRate=DEFAULT_AIRCON_RATES.startup;
  if(!d.airconSleepDayRate||d.airconSleepDayRate===0.30)d.airconSleepDayRate=DEFAULT_AIRCON_RATES.sleepDay;
  if(!d.airconSleepNightRate||d.airconSleepNightRate===0.22)d.airconSleepNightRate=DEFAULT_AIRCON_RATES.sleepNight;
  if(!d.airconDayRate||d.airconDayRate===0.75)d.airconDayRate=DEFAULT_AIRCON_RATES.day;
  if(!d.airconNightRate||d.airconNightRate===0.36)d.airconNightRate=DEFAULT_AIRCON_RATES.night;
  if(d.airconDefaultSleepMode===undefined)d.airconDefaultSleepMode=true;if(d.airconDefaultTemp===undefined)d.airconDefaultTemp='29';
  return d;}}catch{}return JSON.parse(JSON.stringify(INIT));}
function sd(d){try{localStorage.setItem(SK,JSON.stringify(d));}catch{}}
function lk(){return localStorage.getItem(GK)||'';}
function sk(k){k?localStorage.setItem(GK,k):localStorage.removeItem(GK);}

// ─── STATE ───────────────────────────────────────────────────
let S={
  tab:'dash',data:ld(),geminiKey:lk(),drawerOpen:false,
  modal:null,viewMk:curMk(),billsMk:curMk(),
  airTimer:null,
  // setup
  setupInput:'',setupErr:'',setupLoading:false,setupShow:false,
  // forms
  txF:{amount:'',source:'Carinderia',note:'',date:toStr()},
  homeF:{amount:'',unitPrice:'',qty:'1',unit:'pcs',category:'Cleaning Supplies',name:'',store:'Supermarket',note:'',date:toStr()},
  priceF:{name:'',store:'Palengke',price:'',unit:'pcs',category:'Food',subcat:'Ulam (Viand)',note:''},
  stockF:{name:'',category:'Food Staples',quantity:'',unit:'pcs',minQty:'1',note:''},
  airconF:{date:toStr(),start:'22:00',end:'06:00',sleepMode:true,tempC:'29'},
  tvF:{date:toStr(),hours:''},
  applianceF:{name:'',category:'Others',watts:'',qty:'1',sessionMinutes:'60',alwaysOn:false,note:''},
  applianceSessionF:{applianceId:'',date:toStr(),minutes:''},
  airSetF:{rate:'',startup:'',sleepDay:'',sleepNight:'',day:'',night:'',defaultSleep:true,defaultTemp:'',tvWatts:''},
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
function set(p){if(typeof p==='function')Object.assign(S,p(S));else Object.assign(S,p);render();}
function setD(fn){const d=fn(S.data);sd(d);S.data=d;render();}

// ─── ACTIONS ────────────────────────────────────────────────
function addTx(){
  const amt=parseFloat(S.txF.amount);if(!amt||amt<=0)return;
  const tx={id:uid(),amount:amt,source:S.txF.source,note:S.txF.note,date:S.txF.date};
  setD(d=>({...d,balance:d.balance-amt,transactions:[tx,...d.transactions]}));
  set({txF:{amount:'',source:'Carinderia',note:'',date:toStr()},modal:null});
}
function delTx(id){const tx=S.data.transactions.find(t=>t.id===id);if(!tx)return;setD(d=>({...d,balance:d.balance+tx.amount,transactions:d.transactions.filter(t=>t.id!==id)}));}
function addHome(){
  const qty=parseFloat(S.homeF.qty)||1,unitPrice=parseFloat(S.homeF.unitPrice||S.homeF.amount),amt=unitPrice*qty;if(!amt||!S.homeF.name)return;
  const stockId=uid();
  const item={id:uid(),amount:amt,unitPrice,qty,unit:S.homeF.unit||'pcs',linkedStockId:stockId,category:S.homeF.category,name:S.homeF.name,store:S.homeF.store,note:S.homeF.note,date:S.homeF.date};
  setD(d=>({...d,balance:d.balance-amt,homeExpenses:[item,...(d.homeExpenses||[])],stocks:[...(d.stocks||[]),stockFromHome(item,stockId)]}));
  set({homeF:{amount:'',unitPrice:'',qty:'1',unit:'pcs',category:'Cleaning Supplies',name:'',store:'Supermarket',note:'',date:toStr()},modal:null});
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
    const total=(S.data.transactions||[]).filter(t=>ids.has(t.id)).reduce((s,t)=>s+t.amount,0);
    setD(d=>({...d,balance:d.balance+total,transactions:(d.transactions||[]).filter(t=>!ids.has(t.id))}));
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
  const session=airconSessionFromParts(S.airconF.date,S.airconF.start,S.airconF.end,S.airconF.sleepMode!==false,rates);if(!session)return;
  const cost=session.kwh*d.meralcoRate,tempC=parseFloat(S.airconF.tempC);
  const entry={id:uid(),...session,hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost,rateAtTime:d.meralcoRate,ratesAtTime:rates,tempC:isNaN(tempC)?'':tempC,formula:'two-phase-inverter'};
  setD(d=>({...d,airconUsage:[entry,...(d.airconUsage||[])]}));
  set({airconF:{date:toStr(),start:S.airconF.start,end:S.airconF.end,sleepMode:S.airconF.sleepMode!==false,tempC:S.airconF.tempC},modal:null});
}
function delAircon(id){setD(d=>({...d,airconUsage:S.data.airconUsage.filter(x=>x.id!==id)}));}
function addTv(){
  const h=parseFloat(S.tvF.hours);if(!h||h<=0)return;
  const d=S.data,watts=parseFloat(d.tvWatts)||175;
  const kwh=(watts/1000)*h,cost=kwh*d.meralcoRate;
  const entry={id:uid(),date:S.tvF.date,hours:h,watts,kwh,cost,rateAtTime:d.meralcoRate};
  setD(d=>({...d,tvUsage:[entry,...(d.tvUsage||[])]}));
  set({tvF:{date:toStr(),hours:''},modal:null});
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
  const minutes=parseFloat(S.applianceSessionF.minutes)||parseFloat(ap?.sessionMinutes)||0;
  if(!ap||ap.alwaysOn||!minutes)return;
  const est=applianceSessionEstimate(ap,minutes,S.data.meralcoRate);
  const entry={id:uid(),applianceId:ap.id,name:ap.name,category:ap.category,date:S.applianceSessionF.date,minutes,watts:parseFloat(ap.watts)||0,qty:parseFloat(ap.qty)||1,kwh:est.kwh,cost:est.cost,rateAtTime:S.data.meralcoRate};
  setD(d=>({...d,applianceUsage:[entry,...(d.applianceUsage||[])]}));
  set({applianceSessionF:{applianceId:ap.id,date:toStr(),minutes:String(ap.sessionMinutes||minutes)},modal:null});
}
function delApplianceUsage(id){setD(d=>({...d,applianceUsage:(d.applianceUsage||[]).filter(x=>x.id!==id)}));}
function saveAirSet(){
  setD(d=>({...d,
    meralcoRate:parseFloat(S.airSetF.rate)||d.meralcoRate,
    airconStartupRate:parseFloat(S.airSetF.startup)||d.airconStartupRate||DEFAULT_AIRCON_RATES.startup,
    airconSleepDayRate:parseFloat(S.airSetF.sleepDay)||d.airconSleepDayRate||DEFAULT_AIRCON_RATES.sleepDay,
    airconSleepNightRate:parseFloat(S.airSetF.sleepNight)||d.airconSleepNightRate||DEFAULT_AIRCON_RATES.sleepNight,
    airconDayRate:parseFloat(S.airSetF.day)||d.airconDayRate||DEFAULT_AIRCON_RATES.day,
    airconNightRate:parseFloat(S.airSetF.night)||d.airconNightRate||DEFAULT_AIRCON_RATES.night,
    airconDefaultSleepMode:S.airSetF.defaultSleep!==false,
    airconDefaultTemp:S.airSetF.defaultTemp||d.airconDefaultTemp||'29',
    tvWatts:parseFloat(S.airSetF.tvWatts)||d.tvWatts||175
  }));
  set({modal:null});
}
function exportData(){
  const blob=new Blob([JSON.stringify(S.data,null,2)],{type:'application/json'});
  const a=h('a',{href:URL.createObjectURL(blob),download:`ipon-tracker-${toStr()}.json`});
  a.click();
}
function importData(e){
  const reader=new FileReader();reader.onload=ev=>{
    try{const d=JSON.parse(ev.target.result);if(confirm('Overwrite current data?')){sd(d);S.data=d;render();alert('Imported!');}}
    catch{alert('Invalid file');}
  };reader.readAsText(e.target.files[0]);
}
function setBillAmt(id,m,val){setD(d=>({...d,bills:d.bills.map(b=>b.id===id?{...b,monthlyAmounts:{...b.monthlyAmounts,[m]:parseFloat(val)||0}}:b)}));}
function toggleBillPaid(id,m){setD(d=>({...d,bills:d.bills.map(b=>b.id===id?{...b,paid:{...b.paid,[m]:!b.paid[m]}}:b)}));}
function addBill(){if(!S.billF.name)return;setD(d=>({...d,bills:[...d.bills,{id:uid(),name:S.billF.name,monthlyAmounts:{},paid:{}}]}));set({billF:{name:''},modal:null});}
function delBill(id){setD(d=>({...d,bills:d.bills.filter(b=>b.id!==id)}));}
function updBal(){const v=parseFloat(S.balInput.replace(/,/g,''));if(!isNaN(v)){setD(d=>({...d,balance:v}));set({modal:null});}}
function openEdit(type,id){
  let item;
  if(type==='food')item=S.data.transactions.find(t=>t.id===id);
  else if(type==='home')item=(S.data.homeExpenses||[]).find(e=>e.id===id);
  else if(type==='aircon')item=(S.data.airconUsage||[]).find(e=>e.id===id);
  else if(type==='appliance')item=(S.data.appliances||[]).find(e=>e.id===id);
  else if(type==='price')item=S.data.priceItems.find(p=>p.id===id);
  else if(type==='stock')item=(S.data.stocks||[]).find(s=>s.id===id);
  if(!item)return;
  set({modal:'edit',editType:type,editId:id,editDraft:{...item}});
}
function saveEdit(){
  const{editType:t,editId:id,editDraft:dr}=S;
  if(t==='food'){
    const old=S.data.transactions.find(x=>x.id===id);
    const newAmt=parseFloat(dr.amount)||old.amount;
    const delta=newAmt-old.amount;
    setD(d=>({...d,balance:d.balance-delta,transactions:d.transactions.map(x=>x.id===id?{...x,...dr,amount:newAmt}:x)}));
  } else if(t==='home'){
    const old=(S.data.homeExpenses||[]).find(x=>x.id===id);
    const qty=parseFloat(dr.qty)||1;
    const unitPrice=parseFloat(dr.unitPrice)||parseFloat(dr.amount)||old.unitPrice||old.amount;
    const newAmt=unitPrice*qty;
    const delta=newAmt-old.amount;
    const updated={...old,...dr,qty,unitPrice,amount:newAmt,unit:dr.unit||old.unit||'pcs'};
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
    const session=airconSessionFromParts(dr.date||old.date,dr.start||old.start||'22:00',dr.end||old.end||'06:00',dr.sleepMode!==false,rates);
    if(!session)return;
    const newCost=session.kwh*S.data.meralcoRate,tempC=parseFloat(dr.tempC);
    setD(d=>({...d,airconUsage:(d.airconUsage||[]).map(x=>x.id===id?{...old,...dr,...session,hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost:newCost,rateAtTime:S.data.meralcoRate,ratesAtTime:rates,tempC:isNaN(tempC)?'':tempC,formula:'two-phase-inverter'}:x)}));
  } else if(t==='appliance'){
    const watts=parseFloat(dr.watts)||0,qty=parseFloat(dr.qty)||1;
    const sessionMinutes=dr.alwaysOn?0:(parseFloat(dr.sessionMinutes)||0);
    if(!dr.name||!watts||(!dr.alwaysOn&&!sessionMinutes))return;
    setD(d=>({...d,appliances:(d.appliances||[]).map(x=>x.id===id?{...x,...dr,watts,qty,hoursPerDay:dr.alwaysOn?24:0,daysPerMonth:dr.alwaysOn?30:0,sessionMinutes,alwaysOn:!!dr.alwaysOn}:x)}));
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
    setD(d=>({...d,transactions:(d.transactions||[]).map(t=>ids.has(t.id)?{...t,source:dr.source||t.source,date:dr.date||t.date,note:dr.note?dr.note:t.note}:t)}));
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
  if(!S.scanImg||!S.geminiKey)return;
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
    setD(d=>({...d,balance:d.balance-total,transactions:[{id:uid(),amount:total,source:FSRC.includes(item.store)?item.store:'Others',note:[item.name,note].filter(Boolean).join(' · '),date:toStr()},...(d.transactions||[])]}));
  } else if(dest==='home'){
    const cat=HCATS.includes(item.subcat)?item.subcat:(HCATS.includes(item.category)?item.category:'Toiletries & Personal Care');
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
  const rec=data.transactions.filter(t=>new Date(t.date)>=d7);
  const avgD=rec.length?rec.reduce((s,t)=>s+t.amount,0)/7:data.dailyBudget;
  const mBurn=bTotal+avgD*30;
  const runway=mBurn>0?Math.floor(data.balance/(mBurn/30)):9999;
  const todayS=data.transactions.filter(t=>t.date===toStr()).reduce((s,t)=>s+t.amount,0);
  const chart=Array.from({length:7},(_,i)=>{const dd=new Date(now.getTime()-(6-i)*86400000),ds=dd.toISOString().split('T')[0];return{label:dd.toLocaleDateString('en-PH',{weekday:'short'}),spend:data.transactions.filter(t=>t.date===ds).reduce((s,t)=>s+t.amount,0),ds};});
  const maxS=Math.max(...chart.map(x=>x.spend),data.dailyBudget,1);
  return{bTotal,bUnpaid,avgD,mBurn,runway,todayS,chart,maxS};
}
function pGroups(){
  const f=S.data.priceItems.filter(p=>{const mc=S.pCat==='All'||p.category===S.pCat;const ms=!S.pSearch||p.name.toLowerCase().includes(S.pSearch.toLowerCase());return mc&&ms;});
  const g=f.reduce((acc,item)=>{const key=item.name.toLowerCase().trim();if(!acc[key])acc[key]={display:item.name,items:[]};acc[key].items.push(item);return acc;},{});
  Object.values(g).forEach(x=>x.items.sort((a,b)=>a.price-b.price));
  return Object.values(g).sort((a,b)=>a.display.localeCompare(b.display));
}

// ─── SETUP ──────────────────────────────────────────────────
function renderSetup(){
  const wrap=D('setup');
  const logo=D('s-logo');logo.textContent='₱';
  const title=D('s-title');title.textContent='Ipon Tracker';
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
  const dhdr=D('dr-hdr');dhdr.appendChild(Object.assign(D('dr-title'),{textContent:'Ipon Tracker 🇵🇭'}));dhdr.appendChild(Object.assign(D('dr-sub'),{textContent:'Budget · Prices · Savings'}));drawer.appendChild(dhdr);
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
  items.appendChild(drItem('📦','Stocks & Inventory','Track what you have at home',()=>set({tab:'stocks',drawerOpen:false}),S.tab==='stocks'));
  items.appendChild(D('dr-sep'));
  const exp=drItem('📤','Export Data','Save backup to file',exportData);items.appendChild(exp);
  const imp=drItem('📥','Import Data','Restore from backup',()=>{
    const fi=h('input',{type:'file',accept:'.json',onchange:importData});fi.click();
  });items.appendChild(imp);
  items.appendChild(D('dr-sep'));
  items.appendChild(drItem('🔑','Change API Key','Update your Gemini key',()=>{sk('');set({geminiKey:'',setupInput:'',setupErr:'',drawerOpen:false});}));
  drawer.appendChild(items);
  const frag=document.createDocumentFragment();frag.appendChild(dov);frag.appendChild(drawer);
  return frag;
}

// ─── DASHBOARD ──────────────────────────────────────────────
function renderDash(){
  const {bTotal,avgD,mBurn,runway,todayS,chart,maxS}=calc();
  const airconCost = (S.data.airconUsage || []).filter(u => mk(u.date) === curMk()).reduce((s, u) => s + u.cost, 0);
  const tvCost = (S.data.tvUsage || []).filter(u => mk(u.date) === curMk()).reduce((s, u) => s + u.cost, 0);
  const alwaysOnCost = (S.data.appliances || []).reduce((s, a) => s + applianceMonthly(a,S.data.meralcoRate).cost, 0);
  const applianceSessionCost = (S.data.applianceUsage || []).filter(u => mk(u.date) === curMk()).reduce((s, u) => s + u.cost, 0);
  const applianceCost = alwaysOnCost + applianceSessionCost;
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
  const c1=D('card');c1.innerHTML=`<div class="cp"><div class="lbl">Today's Spending</div><div class="sf" style="font-size:23px;color:${ob?'#b83030':'#3a2818'};margin:2px 0">${fmt(todayS)}</div><div style="font-size:10.5px;color:#8a7260">Budget: ${fmt(data.dailyBudget)}</div>${ob?'<div style="font-size:10px;color:#b83030;font-weight:700;margin-top:1px">⚠️ Over budget</div>':''}</div>`;
  const c2=D('card');c2.innerHTML=`<div class="cp"><div class="lbl">Monthly Burn</div><div class="sf" style="font-size:23px;margin:2px 0">${fmt(Math.round(mBurn))}</div><div style="font-size:10.5px;color:#8a7260">Bills + food avg</div></div>`;
  g2.appendChild(c1);g2.appendChild(c2);sec.appendChild(g2);
  if (airconCost + tvCost + applianceCost > 0) {
    const acCard = D('card'); acCard.innerHTML = `<div class="cp"><div class="lbl">Electricity Usage This Month</div><div class="sf" style="font-size:23px;margin:2px 0">${fmt3(airconCost+tvCost+applianceCost)}</div><div style="font-size:10.5px;color:#8a7260">24/7 ${fmt3(alwaysOnCost)} · Sessions ${fmt3(applianceSessionCost)} · Aircon ${fmt3(airconCost)} · TV ${fmt3(tvCost)}</div></div>`;
    sec.appendChild(acCard);
  }
  // Budget slider
  const sc=D('card');const scp=D('cp');
  const sr=D('row');sr.style.marginBottom='7px';sr.innerHTML=`<span class="lbl">Daily Food Budget</span><span class="sf amber-c" style="font-size:20px">${fmt(data.dailyBudget)}</span>`;
  const sl=h('input',{type:'range',min:150,max:700,step:10,value:data.dailyBudget});
  sl.oninput=e=>setD(d=>({...d,dailyBudget:parseInt(e.target.value)}));
  scp.appendChild(sr);scp.appendChild(sl);
  const slr=D('row');slr.style.marginTop='3px';slr.innerHTML=`<span style="font-size:10px;color:#8a7260">₱150 min</span><span style="font-size:10px;color:#8a7260">₱700</span>`;
  scp.appendChild(slr);sc.appendChild(scp);sec.appendChild(sc);
  // 7-day chart
  const cc=D('card');const ccp=D('cp');ccp.style.paddingBottom='5px';
  const cr=D('row');cr.style.marginBottom='11px';cr.innerHTML=`<span class="lbl">7-Day Food Spending</span><span style="font-size:11px;color:#8a7260">Avg ${fmt(Math.round(avgD))}/day</span>`;
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
  const lb=Btn('bp bfull','+ Log Food / Expense',()=>set({modal:'addTx'}));lb.style.marginBottom='4px';sec.appendChild(lb);
  // Recent (Excluded Aircon from recent deductions list)
  const allTx=[...(data.transactions||[]).slice(0,6).map(t=>({...t,type:'food'})),...(data.homeExpenses||[]).slice(0,4).map(t=>({...t,type:'home'}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(allTx.length){
    const rc=D('card');rc.appendChild(Object.assign(D(''),{style:'padding:8px 13px;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Recent Expenses</span>'}));
    allTx.forEach(tx=>{
      const row=D('row cr');row.style.borderBottom='1px solid #e2d9ce';
      const left=D('');
      const nm=D('');nm.style.cssText='font-size:12.5px;font-weight:600';nm.textContent=tx.type==='food'?tx.source:tx.name;
      const info=D('');info.style.cssText='font-size:10.5px;color:#8a7260;margin-top:1px;display:flex;align-items:center;gap:4px';
      const bcls=tx.type==='food'?'bdg-f':tx.type==='home'?'bdg-h':'bdg-a';
      info.appendChild(Sp('bdg '+bcls,tx.type==='food'?'Food':tx.type==='home'?'Home':'Aircon'));
      info.appendChild(document.createTextNode((tx.note?' '+tx.note+' ·':'')+' '+new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})));
      left.appendChild(nm);left.appendChild(info);
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px';
      const amt=D('');amt.style.cssText='font-weight:700;color:#b83030;font-size:13px';amt.textContent='-'+fmt(tx.amount);
      right.appendChild(amt);right.appendChild(h('button',{cls:'del',onClick:()=>tx.type==='food'?delTx(tx.id):delHome(tx.id)},'×'));
      row.appendChild(left);row.appendChild(right);rc.appendChild(row);
    });
    sec.appendChild(rc);
  }
  // Quick action buttons
  const qa=D('');qa.style.cssText='display:flex;gap:8px;margin-bottom:9px';
  const q1=Btn('bg bfull','🏠 Log Home',()=>set({modal:'addHome'}));
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
  else {fa.appendChild(Btn('bgsm','Select',()=>set({multiFood:true,selFood:new Set()})));fa.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addTx'})));}
  toprow.appendChild(fa);sec.appendChild(toprow);
  const mTx=data.transactions.filter(t=>mk(t.date)===S.viewMk);
  const mTotal=mTx.reduce((s,t)=>s+t.amount,0);
  const mDays=[...new Set(mTx.map(t=>t.date))].length;
  const msc=D('card cg');msc.style.marginBottom='9px';msc.innerHTML=`<div class="cp"><div class="row"><div><div class="lblw">Food Spending — ${mklbl(S.viewMk)}</div><div class="sf" style="font-size:28px;color:#fff;margin:2px 0">${fmt(mTotal)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">${mTx.length} transactions · ${mDays} day${mDays!==1?'s':''}</div></div><div style="text-align:right"><div class="lblw">Avg/Day</div><div class="sf" style="font-size:20px;color:#fff;margin-top:3px">${fmt(mDays?Math.round(mTotal/mDays):0)}</div></div></div></div>`;
  sec.appendChild(msc);
  if(!mTx.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">🍽️</div><div>No food expenses logged for this month.</div>';sec.appendChild(e);return sec;}
  const grouped=mTx.reduce((acc,tx)=>{if(!acc[tx.date])acc[tx.date]=[];acc[tx.date].push(tx);return acc;},{});
  Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).forEach(ds=>{
    const txs=grouped[ds],total=txs.reduce((s,t)=>s+t.amount,0),over=total>data.dailyBudget;
    const card=D('card');
    const hdr=D('row');hdr.style.cssText='padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
    hdr.appendChild(h('span',{style:'font-weight:700;font-size:12.5px'},new Date(ds+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})));
    hdr.appendChild(h('span',{cls:'sf',style:`font-size:16px;color:${over?'#b83030':'#2e6e4f'}`},fmt(total)+(over?' ⚠️':'')));
    card.appendChild(hdr);
    txs.forEach(tx=>{
      const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
      inner.style.justifyContent='flex-start';inner.style.gap='9px';
      if(S.multiFood)inner.appendChild(h('input',{type:'checkbox',checked:S.selFood.has(tx.id),style:'width:18px;height:18px;flex:0 0 18px',onClick:e=>{e.stopPropagation();toggleSel('food',tx.id);}}));
      const left=D('');left.style.cssText='flex:1;min-width:0';left.appendChild(h('div',{style:'font-size:12px;font-weight:600'},tx.source));
      left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${tx.note?tx.note+' · ':''}${new Date(tx.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`));
      const right=D('');right.style.cssText='display:flex;align-items:center;gap:6px;flex-shrink:0';
      right.appendChild(h('span',{style:'font-weight:700;font-size:13px'},fmt(tx.amount)));
      const row=S.multiFood?inner:swRow(inner,()=>openEdit('food',tx.id),()=>delTx(tx.id));
      inner.appendChild(left);
      inner.appendChild(right);
      card.appendChild(row);
    });
    const foot=D('');foot.style.cssText='padding:5px 13px;display:flex;justify-content:flex-end';
    foot.appendChild(h('span',{style:`font-size:10.5px;color:${over?'#b83030':'#8a7260'}`},over?`₱${(total-data.dailyBudget).toFixed(0)} over budget`:`₱${(data.dailyBudget-total).toFixed(0)} remaining`));
    card.appendChild(foot);sec.appendChild(card);
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
  else {ha.appendChild(Btn('bgsm','Select',()=>set({multiHome:true,selHome:new Set()})));ha.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addHome'})));}
  toprow.appendChild(ha);sec.appendChild(toprow);
  const chips=D('chips');['All',...HCATS].forEach(cat=>{const c=D('chip'+(S.homeCat===cat?' chip-on':''));c.textContent=cat;c.onclick=()=>set({homeCat:cat});chips.appendChild(c);});sec.appendChild(chips);
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
      const ns=D('');ns.style.cssText='font-size:10.5px;color:#8a7260';ns.textContent=item.store+(item.note?' · '+item.note:'')+' · '+new Date(item.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'});
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
  const si=Inp('',{type:'text',placeholder:'🔍 Search item...',value:S.pSearch});si.style.flex='1';si.oninput=e=>set({pSearch:e.target.value});
  srow.appendChild(si);srow.appendChild(Btn('bp bsm','+ Add',()=>set({modal:'addPrice'})));sec.appendChild(srow);
  const chips=D('chips');['All','Food','Home & Toiletries'].forEach(cat=>{const c=D('chip'+(S.pCat===cat?' chip-on':''));c.textContent=cat;c.onclick=()=>set({pCat:cat});chips.appendChild(c);});sec.appendChild(chips);
  if(!groups.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">🏷️</div><div>No prices tracked yet.<br/>Add items or use AI Scan!</div>';sec.appendChild(e);return sec;}
  groups.forEach(group=>{
    const card=D('card');const hdr=D('');hdr.style.cssText='padding:7px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce';
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
  cp.appendChild(Object.assign(D('qtip'),{innerHTML:'<strong>⚡ Gemini Limits:</strong> Usage is counted per Google Cloud project and per model. The app tries Flash-Lite first, then Flash fallbacks. If quota is reached, wait for the retry time or check AI Studio rate limits.'}));
  const ok=D('row');ok.style.cssText='background:#e6f3ec;border-radius:8px;padding:6px 11px;margin-bottom:11px';
  ok.appendChild(h('span',{style:'font-size:11px;color:#2e6e4f;font-weight:700'},'✅ Gemini Active'));
  ok.appendChild(h('button',{style:'font-size:10.5px;color:#8a7260;background:none;border:none;cursor:pointer',onClick:()=>{sk('');set({geminiKey:'',setupInput:'',setupErr:'',scanData:null,scanImg:null});}},'Change 🔑'));
  cp.appendChild(ok);
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
    const sb=Btn('ba','🔍 '+(S.scanning?'Analyzing...':'Scan Prices'),doScan,S.scanning);sb.style.cssText='flex:1;padding:11px';
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
  const allM=Array.from({length:7},(_,i)=>{const d2=new Date();d2.setMonth(d2.getMonth()-3+i);return mk(d2.toISOString().split('T')[0]);});
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
  const allMonths=[...new Set([...(data.transactions||[]).map(t=>mk(t.date)),...(data.homeExpenses||[]).map(e=>mk(e.date)),...(data.airconUsage||[]).map(e=>mk(e.date)),...(data.tvUsage||[]).map(e=>mk(e.date)),...(data.applianceUsage||[]).map(e=>mk(e.date)),...Array.from({length:3},(_,i)=>{const d2=new Date();d2.setMonth(d2.getMonth()-i);return mk(d2.toISOString().split('T')[0]);})])].sort((a,b)=>b.localeCompare(a));
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
  const airconTotal=airconUsage.reduce((s,u)=>s+u.cost,0);
  const tvTotal=tvUsage.reduce((s,u)=>s+u.cost,0);
  const applianceTotal=appliances.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).cost,0)+applianceUsage.reduce((s,u)=>s+u.cost,0);
  const electricityTotal=airconTotal+tvTotal+applianceTotal;
  const grandTotal=foodTotal+homeTotal+billsTotal; // Exclude aircon as it's part of the bills
  // Hero card
  const hero=D('card cg');hero.style.marginBottom='9px';
  hero.innerHTML=`<div class="cp"><div class="row" style="margin-bottom:10px"><div><div class="lblw">Total Spending — ${mklbl(rm)}</div><div class="sf" style="font-size:32px;color:#fff;margin:2px 0">${fmt(grandTotal)}</div></div></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Food</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(foodTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Home</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(homeTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Bills</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(billsTotal)}</div></div><div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px 5px"><div style="font-size:9px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.3px">Electric</div><div class="sf" style="font-size:13px;color:#fff;margin-top:2px">${fmt(electricityTotal)}</div></div></div></div>`;
  sec.appendChild(hero);
  // Category breakdown
  const catData={};
  foodTx.forEach(t=>{const key=t.source;if(!catData[key])catData[key]={amount:0,type:'food'};catData[key].amount+=t.amount;});
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
  if(foodTx.length){
    const dc=D('card');dc.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Food Spending by Source</span>'}));
    const dcp=D('cp');
    const bySrc=foodTx.reduce((acc,t)=>{if(!acc[t.source])acc[t.source]=0;acc[t.source]+=t.amount;return acc;},{});
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
  // Top expenses
  const allEx=[...foodTx.map(t=>({name:t.source+(t.note?' — '+t.note:''),amount:t.amount,date:t.date,type:'food'})),...homeEx.map(e=>({name:e.name,amount:e.amount,date:e.date,type:'home'})),...airconUsage.map(u=>({name:'Aircon ('+u.hours+' hrs)',amount:u.cost,date:u.date,type:'aircon'})),...tvUsage.map(u=>({name:'TV ('+u.hours+' hrs)',amount:u.cost,date:u.date,type:'aircon'})),...applianceUsage.map(u=>({name:u.name+' ('+u.minutes+' mins)',amount:u.cost,date:u.date,type:'aircon'})),...appliances.filter(a=>a.alwaysOn).map(a=>({name:a.name+' (24/7)',amount:applianceMonthly(a,data.meralcoRate).cost,date:`${rm}-01`,type:'aircon'}))].sort((a,b)=>b.amount-a.amount).slice(0,10);
  if(allEx.length){
    const ec=D('card');ec.style.marginBottom='18px';
    ec.appendChild(Object.assign(D(''),{style:'padding:8px 13px;background:#faf6f1;border-bottom:1px solid #e2d9ce',innerHTML:'<span class="lbl">Top 10 Expenses This Month</span>'}));
    allEx.forEach(e=>{
      const row=D('row cr');row.style.borderBottom='1px solid #e2d9ce';
      const left=D('');
      left.appendChild(h('div',{style:'font-size:12px;font-weight:600'},e.name));
      const info=D('');info.style.cssText='font-size:10px;color:#8a7260;margin-top:1px;display:flex;gap:5px;align-items:center';
      const bcls=e.type==='food'?'bdg-f':e.type==='home'?'bdg-h':'bdg-a';
      info.appendChild(Sp('bdg '+bcls,e.type==='food'?'Food':e.type==='home'?'Home':'Aircon'));
      info.appendChild(document.createTextNode(new Date(e.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})));
      left.appendChild(info);
      row.appendChild(left);row.appendChild(h('span',{cls:'sf',style:'font-size:15px'},fmt(e.amount)));
      ec.appendChild(row);
    });
    sec.appendChild(ec);
  }
  if(!sortedCats.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">📊</div><div>No expenses logged for this month yet.</div>';sec.appendChild(e);}
  return sec;
}

// ─── STOCKS TAB ──────────────────────────────────────────────
function renderStocks(){
  const data=S.data,stocks=data.stocks||[];const sec=D('sec');
  const toprow=D('row');toprow.style.marginBottom='10px';
  toprow.appendChild(h('span',{style:'font-size:14px;font-weight:700;color:#3a2818'},'Stocks & Inventory'));
  toprow.appendChild(Btn('bp bsm','+ Item',()=>set({modal:'addStock'})));sec.appendChild(toprow);
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
  if(!filtered.length){const e=D('card empty');e.innerHTML='<div style="font-size:34px;margin-bottom:7px">📦</div><div>No items tracked yet.<br/>Add items you buy regularly<br/>to keep track of your stocks.</div>';sec.appendChild(e);return sec;}
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
function renderAircon(){
  const data=S.data,sec=D('sec');
  const rates=airconRates(data);
  const usage=data.airconUsage||[],tvUsage=data.tvUsage||[],appliances=data.appliances||[],applianceUsage=data.applianceUsage||[];
  const months=[...new Set([...usage.map(e=>mk(e.date)),...tvUsage.map(e=>mk(e.date)),...applianceUsage.map(e=>mk(e.date)),curMk()])].sort((a,b)=>b.localeCompare(a));
  if(months.length&&!months.includes(S.viewMk))S.viewMk=months[0];
  const mUsage=usage.filter(u=>mk(u.date)===S.viewMk);
  const mTv=tvUsage.filter(u=>mk(u.date)===S.viewMk);
  const mApplianceUsage=applianceUsage.filter(u=>mk(u.date)===S.viewMk);
  const mCost=mUsage.reduce((s,u)=>s+u.cost,0),tvCost=mTv.reduce((s,u)=>s+u.cost,0);
  const alwaysOnCost=appliances.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).cost,0);
  const alwaysOnKwh=appliances.reduce((s,a)=>s+applianceMonthly(a,data.meralcoRate).kwh,0);
  const applianceSessionCost=mApplianceUsage.reduce((s,u)=>s+u.cost,0);
  const applianceSessionKwh=mApplianceUsage.reduce((s,u)=>s+u.kwh,0);
  const applianceCost=alwaysOnCost+applianceSessionCost,applianceKwh=alwaysOnKwh+applianceSessionKwh;
  const mHours=mUsage.reduce((s,u)=>s+u.hours,0);
  const tvHours=mTv.reduce((s,u)=>s+u.hours,0);
  const dailyAlwaysOnCost=alwaysOnCost/30,dailyAlwaysOnKwh=alwaysOnKwh/30;
  const eChart=Array.from({length:7},(_,i)=>{
    const dd=new Date();dd.setDate(dd.getDate()-(6-i));
    const ds=dd.toISOString().split('T')[0];
    const air=usage.filter(u=>u.date===ds);
    const tv=tvUsage.filter(u=>u.date===ds);
    const ap=applianceUsage.filter(u=>u.date===ds);
    const airCost=air.reduce((s,u)=>s+u.cost,0),tvCost=tv.reduce((s,u)=>s+u.cost,0);
    const apCost=ap.reduce((s,u)=>s+u.cost,0);
    const airKwh=air.reduce((s,u)=>s+u.kwh,0),tvKwh=tv.reduce((s,u)=>s+u.kwh,0);
    const apKwh=ap.reduce((s,u)=>s+u.kwh,0);
    return{label:dd.toLocaleDateString('en-PH',{weekday:'short'}),ds,cost:airCost+tvCost+apCost+dailyAlwaysOnCost,kwh:airKwh+tvKwh+apKwh+dailyAlwaysOnKwh,airCost,tvCost,applianceCost:apCost+dailyAlwaysOnCost,airKwh,tvKwh,applianceKwh:apKwh+dailyAlwaysOnKwh};
  });
  const maxECost=Math.max(...eChart.map(x=>x.cost),1);

  const toprow=D('row');toprow.style.marginBottom='10px';
  toprow.appendChild(h('span',{style:'font-size:14px;font-weight:700'},'⚡ Electricity Usage'));
  const topActs=D('');topActs.style.cssText='display:flex;gap:6px';
  topActs.appendChild(Btn('bgsm','Appliances',()=>set({tab:'appliances'})));
  topActs.appendChild(Btn('bgsm','⚙️ Config',()=>set({modal:'airSet',airSetF:{rate:data.meralcoRate,startup:rates.startup,sleepDay:rates.sleepDay,sleepNight:rates.sleepNight,day:rates.day,night:rates.night,defaultSleep:data.airconDefaultSleepMode!==false,defaultTemp:data.airconDefaultTemp||'29',tvWatts:data.tvWatts||175}})));
  toprow.appendChild(topActs);
  sec.appendChild(toprow);

  const hero=D('card cg');hero.innerHTML=`<div class="cp"><div class="lblw">${mklbl(S.viewMk)} Est. Electricity</div><div class="sf" style="font-size:32px;color:#fff;margin:2px 0">${fmt3(mCost+tvCost+applianceCost)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">24/7 ${fmt3(alwaysOnCost)} · Sessions ${fmt3(applianceSessionCost)} · Aircon ${mHours.toFixed(1)}h · TV ${tvHours.toFixed(1)}h</div></div>`;
  sec.appendChild(hero);

  const stats=D('g2');stats.style.marginBottom='9px';
  const s1=D('card');s1.innerHTML=`<div class="cp"><div class="lbl">Always On</div><div class="sf" style="font-size:21px;margin:2px 0">${fmt3(alwaysOnCost)}</div><div style="font-size:10.5px;color:#8a7260">${alwaysOnKwh.toFixed(3)} kWh/month</div></div>`;
  const s2=D('card');s2.innerHTML=`<div class="cp"><div class="lbl">Appliance Sessions</div><div class="sf" style="font-size:21px;margin:2px 0">${fmt3(applianceSessionCost)}</div><div style="font-size:10.5px;color:#8a7260">${mApplianceUsage.length} log${mApplianceUsage.length!==1?'s':''} · ${applianceSessionKwh.toFixed(3)} kWh</div></div>`;
  stats.appendChild(s1);stats.appendChild(s2);sec.appendChild(stats);

  const cc=D('card');const ccp=D('cp');ccp.style.paddingBottom='5px';
  const cr=D('row');cr.style.marginBottom='11px';
  const wkCost=eChart.reduce((s,x)=>s+x.cost,0),wkKwh=eChart.reduce((s,x)=>s+x.kwh,0);
  cr.innerHTML=`<span class="lbl">7-Day Electricity</span><span style="font-size:11px;color:#8a7260">${fmt(wkCost)} · ${wkKwh.toFixed(2)} kWh</span>`;
  const bars=D('bw');
  eChart.forEach(cd=>{
    const isT=cd.ds===toStr(),pct=cd.cost/maxECost;
    const col=D('bc');
    const nl=D('');nl.style.cssText='font-size:7.5px;color:#8a7260;font-weight:600;text-align:center;height:12px';if(cd.cost>0)nl.textContent=Math.round(cd.cost);col.appendChild(nl);
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
  legend.appendChild(h('span',{style:'color:#8a7260'},'Estimated cost from logs'));
  ccp.appendChild(cr);ccp.appendChild(bars);ccp.appendChild(legend);
  cc.appendChild(ccp);sec.appendChild(cc);

  const spec=D('card');spec.innerHTML=`<div class="cp"><div class="lbl">Two-Phase Inverter Estimate</div><div style="font-size:12px;color:#3a2818;line-height:1.6;margin-top:5px">First 60 mins use <b>${rates.startup} kWh/hr</b>. After that: Sleep Mode uses <b>${rates.sleepDay} day</b> / <b>${rates.sleepNight} night</b> kWh/hr; normal mode uses <b>${rates.day} day</b> / <b>${rates.night} night</b> kWh/hr. Day is 6 AM-6 PM. Defaults are ${data.airconDefaultSleepMode!==false?'Sleep Mode':'Normal Mode'}${data.airconDefaultTemp?' at '+data.airconDefaultTemp+'C':''}.</div></div>`;
  sec.appendChild(spec);

  // Counter UI
  const tc=D('card');tc.style.marginBottom='9px';
  const tcp=D('cp');
  tcp.appendChild(h('div',{cls:'lbl',style:'margin-bottom:8px'},'Aircon Counter'));
  const tr=D('row');
  if(!S.airTimer){
    tr.appendChild(h('span',{style:'font-size:13px;color:#8a7260'},'Counter is stopped.'));
    tr.appendChild(Btn('bp','Start Tracking ⏱️',()=>{
      set({airTimer:Date.now()});
    }));
  }else{
    const elapsed=Math.round((Date.now()-S.airTimer)/(1000*60));
    tr.appendChild(h('span',{style:'font-size:13px;font-weight:700;color:#2e6e4f'},`Active: ~${elapsed} mins`));
    tr.appendChild(Btn('ba','Stop & Log 🏁',()=>{
      const sleepMode=data.airconDefaultSleepMode!==false;
      const session=airconSessionFromDates(new Date(S.airTimer),new Date(),sleepMode,rates);
      const cost=session.kwh*data.meralcoRate;
      const tempC=parseFloat(data.airconDefaultTemp);
      const entry={id:uid(),...session,hours:parseFloat(session.hours.toFixed(2)),kwh:session.kwh,cost,rateAtTime:data.meralcoRate,ratesAtTime:rates,tempC:isNaN(tempC)?'':tempC,formula:'two-phase-inverter'};
      setD(d=>({...d,airconUsage:[entry,...(d.airconUsage||[])]}));
      set({airTimer:null});
    }));
  }
  tcp.appendChild(tr);tc.appendChild(tcp);sec.appendChild(tc);

  const actions=D('');actions.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';
  actions.appendChild(Btn('bgfull','+ Aircon Session',()=>set({modal:'addAircon',airconF:{...S.airconF,date:toStr(),sleepMode:data.airconDefaultSleepMode!==false,tempC:data.airconDefaultTemp||S.airconF.tempC||'29'}})));
  actions.appendChild(Btn('bgfull','+ TV Hours',()=>set({modal:'addTv'})));
  actions.appendChild(Btn('bgfull','+ Appliance Session',()=>{
    const first=(data.appliances||[]).find(a=>!a.alwaysOn);
    set({modal:'logAppliance',applianceSessionF:{applianceId:first?.id||'',date:toStr(),minutes:first?.sessionMinutes?String(first.sessionMinutes):''}});
  }));
  actions.appendChild(Btn('bgfull','Manage Appliances',()=>set({tab:'appliances'})));
  sec.appendChild(actions);

  if(!mUsage.length&&!mTv.length&&!mApplianceUsage.length&&!alwaysOnCost){const e=D('card empty');e.innerHTML='<div>No electricity usage logged for this month.</div>';sec.appendChild(e);return sec;}

  if(mUsage.length){
  const card=D('card');card.appendChild(DivHdr('Aircon History'));
  mUsage.forEach(u=>{
    const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
    const left=D('');
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`Aircon · ${u.hours} hours${u.sleepMode!==false?' · Sleep':''}${u.tempC!==''&&u.tempC!=null?' · '+u.tempC+'C':''}`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}${u.start&&u.end?' · '+fmtTime12(u.start)+'-'+fmtTime12(u.end):''} · ${u.kwh.toFixed(2)} kWh`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt(u.cost)));
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
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`TV · ${u.hours} hours`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})} · ${u.watts}W · ${u.kwh.toFixed(2)} kWh`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt(u.cost)));
    right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},`@${u.rateAtTime}/kWh`));
    inner.appendChild(left);inner.appendChild(right);
    tvCard.appendChild(swRow(inner,null,()=>delTv(u.id)));
  });
  sec.appendChild(tvCard);
  }
  if(mApplianceUsage.length){
  const apHist=D('card');apHist.appendChild(DivHdr('Appliance Session History'));
  mApplianceUsage.forEach(u=>{
    const inner=D('row cr');inner.style.borderBottom='1px solid #e2d9ce';
    const left=D('');
    left.appendChild(h('div',{style:'font-size:13px;font-weight:600'},`${u.name} · ${u.minutes} mins`));
    left.appendChild(h('div',{style:'font-size:10.5px;color:#8a7260'},`${new Date(u.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})} · ${u.qty}x ${u.watts}W · ${u.kwh.toFixed(3)} kWh`));
    const right=D('');right.style.cssText='text-align:right';
    right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt3(u.cost)));
    right.appendChild(h('div',{style:'font-size:9px;color:#8a7260'},`@${u.rateAtTime}/kWh`));
    inner.appendChild(left);inner.appendChild(right);
    apHist.appendChild(swRow(inner,null,()=>delApplianceUsage(u.id)));
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

  const hero=D('card cg');hero.innerHTML=`<div class="cp"><div class="lblw">Configured Appliance Estimate</div><div class="sf" style="font-size:30px;color:#fff;margin:2px 0">${fmt3(alwaysCost+sessionCost)}</div><div style="font-size:11px;color:rgba(255,255,255,.55)">24/7 monthly ${fmt3(alwaysCost)} · ${mklbl(curMk())} sessions ${fmt3(sessionCost)}</div></div>`;
  sec.appendChild(hero);

  const quick=D('');quick.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px';
  const first=session[0];
  quick.appendChild(Btn('bgfull','Log Session',()=>set({modal:'logAppliance',applianceSessionF:{applianceId:first?.id||'',date:toStr(),minutes:first?.sessionMinutes?String(first.sessionMinutes):''}}),!first));
  quick.appendChild(Btn('bgfull','Electricity Overview',()=>set({tab:'aircon'})));
  sec.appendChild(quick);

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
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt3(est.cost)));
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
      right.appendChild(h('div',{cls:'sf',style:'font-size:15px'},fmt3(est.cost)));
      right.appendChild(h('button',{cls:'btn bsm',style:'margin-top:4px',onClick:()=>set({modal:'logAppliance',applianceSessionF:{applianceId:a.id,date:toStr(),minutes:String(a.sessionMinutes||60)}})},'Log'));
      inner.appendChild(left);inner.appendChild(right);
      sessionCard.appendChild(swRow(inner,()=>openEdit('appliance',a.id),()=>delAppliance(a.id)));
    });
  }else sessionCard.appendChild(Object.assign(D('empty'),{textContent:'No session appliances configured.'}));
  sec.appendChild(sessionCard);

  sec.appendChild(D(''));sec.lastChild.style.height='18px';
  return sec;
}

// ─── MODALS ──────────────────────────────────────────────────
function renderModal(){
  if(!S.modal)return null;
  const bg=D('mbg');bg.onclick=e=>{if(e.target===bg)set({modal:null});};
  const box=D('mbox');
  const M=(t,c)=>{const tt=D('mt');tt.textContent=t;box.appendChild(tt);box.appendChild(c);bg.appendChild(box);return bg;};
  if(S.modal==='addTx'){
    const c=D('');
    const ai=Inp('',{type:'number',inputmode:'decimal',placeholder:'e.g. 150',value:S.txF.amount});ai.oninput=e=>S.txF.amount=e.target.value;setTimeout(()=>ai.focus(),50);
    c.appendChild(Fg('Amount (₱)',ai));c.appendChild(Fg('Source',Sel(S.txF.source,FSRC,v=>S.txF.source=v)));
    const ni=Inp('',{type:'text',placeholder:'e.g. Pork sinigang',value:S.txF.note});ni.oninput=e=>S.txF.note=e.target.value;c.appendChild(Fg('Notes (optional)',ni));
    const di=Inp('',{type:'date',value:S.txF.date});di.oninput=e=>S.txF.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save',addTx);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log Food Expense',c);
  }
  if(S.modal==='addHome'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Dish soap, Shampoo',value:S.homeF.name});ni.oninput=e=>S.homeF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
    const calc=()=>{const total=(parseFloat(S.homeF.unitPrice)||0)*(parseFloat(S.homeF.qty)||1);S.homeF.amount=total?total.toFixed(2):'';ti.value=S.homeF.amount;};
    const g2=D('g2');
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',value:S.homeF.qty});qi.oninput=e=>{S.homeF.qty=e.target.value;calc();};qfg.appendChild(qi);g2.appendChild(qfg);
    const upfg=D('fg');upfg.appendChild(h('label',{cls:'fl'},'Unit Price (₱)'));const ui=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.homeF.unitPrice});ui.oninput=e=>{S.homeF.unitPrice=e.target.value;calc();};upfg.appendChild(ui);g2.appendChild(upfg);c.appendChild(g2);
    c.appendChild(Fg('Unit',Sel(S.homeF.unit,UNITS,v=>S.homeF.unit=v)));
    const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.homeF.amount,readonly:true});c.appendChild(Fg('Total (₱)',ti));
    c.appendChild(Fg('Category',Sel(S.homeF.category,HCATS,v=>S.homeF.category=v)));c.appendChild(Fg('Store',Sel(S.homeF.store,STORES,v=>S.homeF.store=v)));
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
    const catSel=Sel(S.priceF.category,['Food','Home & Toiletries'],v=>{S.priceF.category=v;S.priceF.subcat=v==='Food'?FCATS[0]:HCATS[0];render();});c.appendChild(Fg('Category',catSel));
    c.appendChild(Fg('Subcategory',Sel(S.priceF.subcat,S.priceF.category==='Food'?FCATS:HCATS,v=>S.priceF.subcat=v)));
    c.appendChild(Fg('Store',Sel(S.priceF.store,STORES,v=>S.priceF.store=v)));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save Price',addPrice);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Price',c);
  }
  if(S.modal==='addStock'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Rice, Shampoo, Dishwashing',value:S.stockF.name});ni.oninput=e=>S.stockF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
    c.appendChild(Fg('Category',Sel(S.stockF.category,SCATS,v=>S.stockF.category=v)));
    const g2=D('g2');
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Current Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',placeholder:'0',value:S.stockF.quantity});qi.oninput=e=>S.stockF.quantity=e.target.value;qfg.appendChild(qi);g2.appendChild(qfg);
    const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(S.stockF.unit,UNITS,v=>S.stockF.unit=v));g2.appendChild(ufg);c.appendChild(g2);
    const mfg=D('fg');mfg.appendChild(h('label',{cls:'fl'},'Min Qty (alert below this)'));const mi=Inp('',{type:'number',inputmode:'decimal',placeholder:'1',value:S.stockF.minQty});mi.oninput=e=>S.stockF.minQty=e.target.value;mfg.appendChild(mi);c.appendChild(mfg);
    const nt=Inp('',{type:'text',placeholder:'e.g. Buy at Palengke',value:S.stockF.note});nt.oninput=e=>S.stockF.note=e.target.value;c.appendChild(Fg('Notes (optional)',nt));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Add Item',addStock);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Stock Item',c);
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
    const sr=D('row');sr.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
    const cb=h('input',{type:'checkbox',checked:S.airconF.sleepMode!==false,style:'width:18px;height:18px'});cb.onchange=e=>S.airconF.sleepMode=e.target.checked;
    sr.appendChild(cb);sr.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Sleep Mode'));c.appendChild(sr);
    const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional, e.g. 29',value:S.airconF.tempC||''});ti.oninput=e=>S.airconF.tempC=e.target.value;c.appendChild(Fg('Room Temp (C)',ti,'Optional. Your usual sleep-mode range is 28-30C.'));
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},'Uses your editable config rates. After the first 60 mins, the estimate switches by Sleep Mode and day/night time.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Log Usage',addAircon);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log Aircon Usage',c);
  }
  if(S.modal==='addTv'){
    const c=D('');
    const hi=Inp('',{type:'number',inputmode:'decimal',placeholder:'e.g. 4',value:S.tvF.hours});hi.oninput=e=>S.tvF.hours=e.target.value;setTimeout(()=>hi.focus(),50);c.appendChild(Fg('Hours Used',hi,`Uses ${S.data.tvWatts||175}W from Electricity Config.`));
    const di=Inp('',{type:'date',value:S.tvF.date});di.oninput=e=>S.tvF.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Log TV',addTv);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log TV Usage',c);
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
    c.appendChild(Fg('Appliance',Sel(S.applianceSessionF.applianceId,sessionApps.map(a=>a.id),v=>{const ap=sessionApps.find(a=>a.id===v);S.applianceSessionF.applianceId=v;S.applianceSessionF.minutes=ap?.sessionMinutes?String(ap.sessionMinutes):S.applianceSessionF.minutes;render();})));
    c.lastChild.querySelector('select').querySelectorAll('option').forEach(op=>{const ap=sessionApps.find(a=>a.id===op.value);if(ap)op.textContent=ap.name;});
    const mi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'e.g. 30',value:S.applianceSessionF.minutes||selected.sessionMinutes||''});mi.oninput=e=>S.applianceSessionF.minutes=e.target.value;c.appendChild(Fg('Minutes Used',mi,`${selected.qty||1}x ${selected.watts||0}W · default ${selected.sessionMinutes||60} min/session`));
    const di=Inp('',{type:'date',value:S.applianceSessionF.date});di.oninput=e=>S.applianceSessionF.date=e.target.value;c.appendChild(Fg('Date',di));
    const est=applianceSessionEstimate(selected,parseFloat(S.applianceSessionF.minutes)||selected.sessionMinutes||0,S.data.meralcoRate);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},`Estimated session: ${est.kwh.toFixed(3)} kWh · ${fmt3(est.cost)}.`));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Log Session',addApplianceUsage);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Log Appliance Session',c);
  }
  if(S.modal==='addAppliance'){
    const c=D('');
    const ni=Inp('',{type:'text',placeholder:'e.g. Rice cooker, LED bulb',value:S.applianceF.name});ni.oninput=e=>S.applianceF.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Appliance Name',ni));
    c.appendChild(Fg('Category',Sel(S.applianceF.category,APPLIANCE_CATS,v=>S.applianceF.category=v)));
    const g1=D('g2');
    const wfg=D('fg');wfg.appendChild(h('label',{cls:'fl'},'Watts'));const wi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'e.g. 60',value:S.applianceF.watts});wi.oninput=e=>S.applianceF.watts=e.target.value;wfg.appendChild(wi);g1.appendChild(wfg);
    const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'1',value:S.applianceF.qty});qi.oninput=e=>S.applianceF.qty=e.target.value;qfg.appendChild(qi);g1.appendChild(qfg);c.appendChild(g1);
    const ar=D('row');ar.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
    const cb=h('input',{type:'checkbox',checked:S.applianceF.alwaysOn,style:'width:18px;height:18px'});cb.onchange=e=>{S.applianceF.alwaysOn=e.target.checked;render();};
    ar.appendChild(cb);ar.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Runs 24/7'));c.appendChild(ar);
    if(!S.applianceF.alwaysOn){
      const sm=Inp('',{type:'number',inputmode:'decimal',step:'0.001',placeholder:'e.g. 30',value:S.applianceF.sessionMinutes});sm.oninput=e=>S.applianceF.sessionMinutes=e.target.value;c.appendChild(Fg('Default Minutes / Session',sm,'Used when logging kettle, chargers, lights, fan, or washing machine sessions.'));
    }
    const nt=Inp('',{type:'text',placeholder:'Optional notes',value:S.applianceF.note});nt.oninput=e=>S.applianceF.note=e.target.value;c.appendChild(Fg('Notes',nt));
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},S.applianceF.alwaysOn?`24/7 appliances auto-compute monthly using ${fmt(S.data.meralcoRate)}/kWh.`:'Session appliances only count when you log a usage session.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Add Appliance',addAppliance);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Add Appliance',c);
  }
  if(S.modal==='airSet'){
    const c=D('');
    const ri=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.rate});ri.oninput=e=>S.airSetF.rate=e.target.value;c.appendChild(Fg('Meralco Rate (₱/kWh)',ri));
    const gA=D('g2');
    const stfg=D('fg');stfg.appendChild(h('label',{cls:'fl'},'Initial kWh/hr'));const sti=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.startup});sti.oninput=e=>S.airSetF.startup=e.target.value;stfg.appendChild(sti);gA.appendChild(stfg);
    const sdFg=D('fg');sdFg.appendChild(h('label',{cls:'fl'},'Sleep Day'));const sdi=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.sleepDay});sdi.oninput=e=>S.airSetF.sleepDay=e.target.value;sdFg.appendChild(sdi);gA.appendChild(sdFg);
    c.appendChild(gA);
    const gB=D('g2');
    const snFg=D('fg');snFg.appendChild(h('label',{cls:'fl'},'Sleep Night'));const sni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.sleepNight});sni.oninput=e=>S.airSetF.sleepNight=e.target.value;snFg.appendChild(sni);gB.appendChild(snFg);
    const dFg=D('fg');dFg.appendChild(h('label',{cls:'fl'},'Normal Day'));const dni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.day});dni.oninput=e=>S.airSetF.day=e.target.value;dFg.appendChild(dni);gB.appendChild(dFg);
    c.appendChild(gB);
    const gC=D('g2');
    const nFg=D('fg');nFg.appendChild(h('label',{cls:'fl'},'Normal Night'));const nni=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.night});nni.oninput=e=>S.airSetF.night=e.target.value;nFg.appendChild(nni);gC.appendChild(nFg);
    const tFg=D('fg');tFg.appendChild(h('label',{cls:'fl'},'Default Temp (C)'));const dti=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.defaultTemp});dti.oninput=e=>S.airSetF.defaultTemp=e.target.value;tFg.appendChild(dti);gC.appendChild(tFg);
    c.appendChild(gC);
    const dsr=D('row');dsr.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
    const dcb=h('input',{type:'checkbox',checked:S.airSetF.defaultSleep!==false,style:'width:18px;height:18px'});dcb.onchange=e=>S.airSetF.defaultSleep=e.target.checked;
    dsr.appendChild(dcb);dsr.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Default to Sleep Mode'));c.appendChild(dsr);
    c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;margin-bottom:12px;line-height:1.55'},'For a 23 sqm mostly sealed room at 28-30C, the default sleep-mode rates are a reasonable starting point. Tune after comparing with your meter.'));
    const tvw=Inp('',{type:'number',inputmode:'decimal',value:S.airSetF.tvWatts});tvw.oninput=e=>S.airSetF.tvWatts=e.target.value;c.appendChild(Fg('TV Watts',tvw,'Xiaomi TV A Pro 65 2025 official spec: 175W.'));
    const ca=Btn('bg','Cancel',()=>set({modal:null}));ca.style.flex='1';const sa=Btn('bp','Save Settings',saveAirSet);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Electricity Config',c);
  }
  if(S.modal==='batchEdit'&&S.batchDraft){
    const dr=S.batchDraft,t=S.batchType,c=D('');
    const count=(t==='food'?S.selFood:S.selHome).size;
    c.appendChild(h('p',{style:'font-size:11.5px;color:#8a7260;margin-bottom:12px;line-height:1.5'},`Editing ${count} selected ${t==='food'?'food':'home'} line${count!==1?'s':''}. Blank fields stay unchanged.`));
    if(t==='food'){
      c.appendChild(Fg('Source',Sel('', ['',...FSRC],v=>{dr.source=v;})));
    }else{
      c.appendChild(Fg('Category',Sel('', ['',...HCATS],v=>{dr.category=v;})));
      c.appendChild(Fg('Store',Sel('', ['',...STORES],v=>{dr.store=v;})));
    }
    const nt=Inp('',{type:'text',placeholder:'Leave blank to keep existing notes',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
    const di=Inp('',{type:'date',value:dr.date||''});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    const ca=Btn('bg','Cancel',()=>set({modal:null,batchType:null,batchDraft:null}));ca.style.flex='1';const sa=Btn('bp','Apply',saveBatchEdit);sa.style.flex='2';c.appendChild(Mr(ca,sa));return M('Edit Selected',c);
  }
  if(S.modal==='edit'&&S.editDraft){
    const dr=S.editDraft,t=S.editType;
    const c=D('');
    if(t==='food'){
      const ai=Inp('',{type:'number',inputmode:'decimal',placeholder:'Amount',value:dr.amount});ai.oninput=e=>dr.amount=e.target.value;setTimeout(()=>ai.focus(),50);c.appendChild(Fg('Amount (₱)',ai));
      c.appendChild(Fg('Source',Sel(dr.source,FSRC,v=>{dr.source=v;})));
      const ni=Inp('',{type:'text',placeholder:'Notes',value:dr.note||''});ni.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',ni));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='home'){
      if(!dr.qty)dr.qty=1;if(!dr.unitPrice)dr.unitPrice=dr.amount||0;if(!dr.unit)dr.unit='pcs';
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
      const g2=D('g2');
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',value:dr.qty});qi.oninput=e=>{dr.qty=e.target.value;ai.value=((parseFloat(dr.unitPrice)||0)*(parseFloat(dr.qty)||1)).toFixed(2);dr.amount=ai.value;};qfg.appendChild(qi);g2.appendChild(qfg);
      const upfg=D('fg');upfg.appendChild(h('label',{cls:'fl'},'Unit Price (₱)'));const ui=Inp('',{type:'number',inputmode:'decimal',value:dr.unitPrice});ui.oninput=e=>{dr.unitPrice=e.target.value;ai.value=((parseFloat(dr.unitPrice)||0)*(parseFloat(dr.qty)||1)).toFixed(2);dr.amount=ai.value;};upfg.appendChild(ui);g2.appendChild(upfg);c.appendChild(g2);
      c.appendChild(Fg('Unit',Sel(dr.unit,UNITS,v=>{dr.unit=v;})));
      const ai=Inp('',{type:'number',inputmode:'decimal',value:dr.amount,readonly:true});c.appendChild(Fg('Total (₱)',ai));
      c.appendChild(Fg('Category',Sel(dr.category||HCATS[0],HCATS,v=>{dr.category=v;})));
      c.appendChild(Fg('Store',Sel(dr.store||STORES[0],STORES,v=>{dr.store=v;})));
      const nt=Inp('',{type:'text',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
    } else if(t==='aircon'){
      if(!dr.start)dr.start='22:00';if(!dr.end)dr.end=timePlus(dr.start,(parseFloat(dr.hours)||8)*60)||'06:00';if(dr.sleepMode===undefined)dr.sleepMode=true;if(dr.tempC===undefined)dr.tempC=S.data.airconDefaultTemp||'29';
      const di=Inp('',{type:'date',value:dr.date});di.oninput=e=>dr.date=e.target.value;c.appendChild(Fg('Date',di));
      const g2=D('g2');
      const sfg=D('fg');sfg.appendChild(h('label',{cls:'fl'},'Start Time'));sfg.appendChild(Time12Control(dr.start,v=>dr.start=v));g2.appendChild(sfg);
      const efg=D('fg');efg.appendChild(h('label',{cls:'fl'},'End Time'));efg.appendChild(Time12Control(dr.end,v=>dr.end=v));g2.appendChild(efg);c.appendChild(g2);
      const sr=D('row');sr.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
      const cb=h('input',{type:'checkbox',checked:dr.sleepMode!==false,style:'width:18px;height:18px'});cb.onchange=e=>dr.sleepMode=e.target.checked;
      sr.appendChild(cb);sr.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Sleep Mode'));c.appendChild(sr);
      const ti=Inp('',{type:'number',inputmode:'decimal',placeholder:'Optional, e.g. 29',value:dr.tempC||''});ti.oninput=e=>dr.tempC=e.target.value;c.appendChild(Fg('Room Temp (C)',ti,'Optional. Your usual sleep-mode range is 28-30C.'));
    } else if(t==='appliance'){
      if(!dr.qty)dr.qty=1;if(!dr.sessionMinutes&&!dr.alwaysOn)dr.sessionMinutes=Math.max(1,Math.round((parseFloat(dr.hoursPerDay)||1)*60));
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Appliance Name',ni));
      c.appendChild(Fg('Category',Sel(dr.category||'Others',APPLIANCE_CATS,v=>{dr.category=v;})));
      const g1=D('g2');
      const wfg=D('fg');wfg.appendChild(h('label',{cls:'fl'},'Watts'));const wi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.watts});wi.oninput=e=>dr.watts=e.target.value;wfg.appendChild(wi);g1.appendChild(wfg);
      const qfg=D('fg');qfg.appendChild(h('label',{cls:'fl'},'Qty'));const qi=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.qty});qi.oninput=e=>dr.qty=e.target.value;qfg.appendChild(qi);g1.appendChild(qfg);c.appendChild(g1);
      const ar=D('row');ar.style.cssText='justify-content:flex-start;gap:8px;margin:3px 0 12px';
      const acb=h('input',{type:'checkbox',checked:dr.alwaysOn,style:'width:18px;height:18px'});acb.onchange=e=>{dr.alwaysOn=e.target.checked;render();};
      ar.appendChild(acb);ar.appendChild(h('span',{style:'font-size:12.5px;font-weight:700;color:#3a2818'},'Runs 24/7'));c.appendChild(ar);
      if(!dr.alwaysOn){
        const sm=Inp('',{type:'number',inputmode:'decimal',step:'0.001',value:dr.sessionMinutes||60});sm.oninput=e=>dr.sessionMinutes=e.target.value;c.appendChild(Fg('Default Minutes / Session',sm));
      }
      const nt=Inp('',{type:'text',value:dr.note||''});nt.oninput=e=>dr.note=e.target.value;c.appendChild(Fg('Notes',nt));
      const est=applianceMonthly(dr,S.data.meralcoRate);
      const preview=dr.alwaysOn?`Current estimate: ${est.kwh.toFixed(2)} kWh/month · ${fmt3(est.cost)}/month.`:`Per-session estimate: ${applianceSessionEstimate(dr,dr.sessionMinutes||60,S.data.meralcoRate).kwh.toFixed(3)} kWh · ${fmt3(applianceSessionEstimate(dr,dr.sessionMinutes||60,S.data.meralcoRate).cost)}.`;
      c.appendChild(h('p',{style:'font-size:11px;color:#8a7260;line-height:1.5;margin-bottom:10px'},preview));
    } else if(t==='price'){
      const ni=Inp('',{type:'text',value:dr.name||''});ni.oninput=e=>dr.name=e.target.value;setTimeout(()=>ni.focus(),50);c.appendChild(Fg('Item Name',ni));
      const g2=D('g2');
      const pfg=D('fg');pfg.appendChild(h('label',{cls:'fl'},'Price (₱)'));const pi=Inp('',{type:'number',inputmode:'decimal',value:dr.price});pi.oninput=e=>dr.price=e.target.value;pfg.appendChild(pi);g2.appendChild(pfg);
      const ufg=D('fg');ufg.appendChild(h('label',{cls:'fl'},'Unit'));ufg.appendChild(Sel(dr.unit||'pcs',UNITS,v=>{dr.unit=v;}));g2.appendChild(ufg);c.appendChild(g2);
      c.appendChild(Fg('Store',Sel(dr.store||STORES[0],STORES,v=>{dr.store=v;})));
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
    const labels={food:'Edit Food Expense',home:'Edit Home Expense',aircon:'Edit Aircon Usage',appliance:'Edit Appliance',price:'Edit Price',stock:'Edit Stock Item'};
    return M(labels[t]||'Edit',c);
  }
  return null;
}

// ─── MAIN RENDER ─────────────────────────────────────────────
const TABS=[{id:'dash',icon:'🏠',label:'Home'},{id:'food',icon:'🍽️',label:'Food'},{id:'home',icon:'🧴',label:'Home'},{id:'bills',icon:'📋',label:'Bills'},{id:'aircon',icon:'⚡',label:'Electric'},{id:'scan',icon:'📸',label:'Scan'}];
const SCREEN_LABELS={dash:'Overview',food:'Food Expenses',home:'Home & Toiletries',bills:'Bills',prices:'Price Comparison',scan:'AI Scanner',reports:'📊 Reports',stocks:'📦 Stocks & Inventory',aircon:'Electricity Usage',appliances:'Appliance Manager'};

function render(){
  openSw=null;
  const root=document.getElementById('app');root.innerHTML='';
  if(!S.geminiKey){root.style.background='#1b4d35';root.appendChild(renderSetup());return;}
  root.style.background='#f7f3ee';
  const app=D('');app.style.cssText='max-width:480px;margin:0 auto;min-height:100vh;background:#f7f3ee;padding-bottom:72px';
  // Close swipe on tap outside
  app.addEventListener('touchstart',e=>{if(openSw&&!openSw.contains(e.target)){const c=openSw.querySelector('.swc');if(c){c.style.transition='transform .15s ease';c.style.transform='';}openSw=null;}},{passive:true});
  // Drawer
  app.appendChild(renderDrawer());
  // Header
  const hdr=h('div',{cls:'hdr'});const hrow=h('div',{cls:'hrow'});
  hrow.appendChild(h('button',{cls:'h-menu',onClick:()=>set({drawerOpen:true})},'☰'));
  const hmid=D('h-mid');hmid.appendChild(Object.assign(D('htitle'),{textContent:SCREEN_LABELS[S.tab]||'Ipon Tracker'}));hmid.appendChild(Object.assign(D('hsub'),{textContent:'Budget · Prices · Savings'}));
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
}

render();
