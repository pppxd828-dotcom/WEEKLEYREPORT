import type { InboxItem, TaskMasterItem } from './App';

// 唯讀：不呼叫原 Apps Script、不修改任何工作表。不要把 token 放進 localStorage。
export interface SheetLog { week:string; taskIds:string; progress:string; status:string; recordedAt:string }
export interface SheetSnapshot { inbox:InboxItem[]; master:TaskMasterItem[]; logs:SheetLog[] }
type TokenResponse = { access_token?:string; error?:string };
declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (config: {client_id:string;scope:string;callback:(r:TokenResponse)=>void;error_callback:(r:{type:string})=>void})=>{requestAccessToken:(options?:{prompt:string})=>void} } } } } }

let scriptPromise:Promise<void>|undefined;
function loadGoogle():Promise<void>{
 if(window.google?.accounts.oauth2)return Promise.resolve();
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>resolve();script.onerror=()=>{scriptPromise=undefined;reject(new Error('Google 登入元件載入失敗，請確認網路或瀏覽器阻擋設定。'))};document.head.appendChild(script)});
 return scriptPromise;
}
export async function requestReadToken(clientId:string):Promise<string>{
 await loadGoogle();
 return new Promise((resolve,reject)=>{
  if(!window.google?.accounts.oauth2){reject(new Error('Google 登入元件未就緒。'));return}
  const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId.trim(),scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:r=>r.access_token?resolve(r.access_token):reject(new Error(`Google 授權未完成：${r.error||'未知錯誤'}`)),error_callback:e=>reject(new Error(`Google 授權視窗未完成：${e.type}`))});
  client.requestAccessToken({prompt:'consent'});
 });
}
const str=(v:unknown)=>String(v??'').trim();
const value=(v:unknown,fallback='待確認')=>str(v)||fallback;
function requireHeader(row:unknown[]|undefined,expected:string[],name:string){if(!row||expected.some((v,i)=>str(row[i])!==v))throw new Error(`${name} 標題列與預期不同；為避免誤讀，已停止載入。`)}
function groupKey(ref:string,id:string){return ref||`無關聯單號｜${id}`}
// 匯入區域是固定畫面，不含穩定來源 ID；列號僅供當次畫面識別，不用於寫回。
export function mapSheetRows(ranges:unknown[][][]):SheetSnapshot{
 if(ranges.length!==4)throw new Error('試算表回應不完整。');
 const [tasks,atms,masters,logs]=ranges;
 requireHeader(tasks[0],['轉入核取','來源類別','案件標題 / 摘要','當前階段','負責人/廠商','關聯單號 / 版本','對應 Task 分類','優先級','處置備註'],'雜事收件匣');
 requireHeader(atms[0],['轉入核取','機台代碼','所屬局名 / 故障現象','故障狀態','維護廠商 / 機型','累計/近90天次數','故障性質分類','衝擊等級','週報與處置規劃'],'ATM 收件匣');
 requireHeader(masters[0],['Task_ID','區塊分類','標題','關聯單號','當前階段','負責人','JSON_Data'],'主任務庫');
 requireHeader(logs[0],['週別_ID','Task_ID','本週進展說明','AI_Status','紀錄時間'],'週報日誌');
 const taskItems:InboxItem[]=tasks.slice(1).flatMap((r,i)=>{if(!str(r[2]))return[];const id=`inbox-task-row-${i+7}`,ref=str(r[5]),note=str(r[8]);return [{id,kind:'雜事',relationId:groupKey(ref,id),relationTitle:ref||'無關聯單號',summary:value(r[2]),source:value(r[1]),stage:value(r[3]),owner:value(r[4]),category:value(r[6]),priority:value(r[7]),tags:[str(r[1]),str(r[6])].filter(Boolean),progress:note||'資料未提供',risk:'資料未提供',nextStep:'資料未提供'}]});
 const atmItems:InboxItem[]=atms.slice(1).flatMap((r,i)=>{if(!str(r[1]))return[];const id=`inbox-atm-row-${i+19}`,code=str(r[1]),note=str(r[8]),match=str(r[5]).match(/近\s*90\s*天\s*(\d+)\s*次/);return [{id,kind:'ATM 故障',relationId:groupKey('',id),relationTitle:'ATM 異常｜'+code,summary:value(r[2]),source:'ATM 收件匣',stage:value(r[3]),owner:value(r[4]),category:'硬體維護',priority:value(r[7]),tags:[str(r[6])].filter(Boolean),progress:note||'資料未提供',risk:'資料未提供',nextStep:'資料未提供',machineCode:code,branch:str(r[2]),incidents90d:match?Number(match[1]):undefined,impact:str(r[6])}]});
 const master:TaskMasterItem[]=masters.slice(1).flatMap((r,i)=>{if(!str(r[0])&&!str(r[2]))return[];const taskId=value(r[0],`第 ${i+2} 列，Task_ID 待確認`),id=`master-row-${i+2}`,ref=str(r[3]);let extra:Record<string,unknown>={};try{const parsed=JSON.parse(str(r[6])||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))extra=parsed}catch{/* 原始值保留顯示，不推測其格式 */}const note=str(extra.notes)||str(r[6]);return [{id,kind:'雜事',relationId:groupKey(ref,id),relationTitle:ref||'無關聯單號',summary:value(r[2]),source:taskId,stage:value(r[4]),owner:value(r[5]),category:value(r[1]),priority:value(extra.priority),tags:[str(r[1])].filter(Boolean),progress:note||'資料未提供',risk:'資料未提供',nextStep:'資料未提供',reviewedAt:'資料未提供'}]});
 const outLogs=logs.slice(1).flatMap(r=>{if(!str(r[0])&&!str(r[1])&&!str(r[2]))return[];return [{week:value(r[0]),taskIds:value(r[1]),progress:value(r[2]),status:value(r[3]),recordedAt:value(r[4])}]});
 return {inbox:[...taskItems,...atmItems],master,logs:outLogs};
}
export async function readSheets(token:string,id:string):Promise<SheetSnapshot>{
 if(!/^[a-zA-Z0-9_-]{20,}$/.test(id.trim()))throw new Error('試算表 ID 格式不正確，請填網址 /d/ 與 /edit 之間的 ID。');
 const ranges=["'Task_Inbox'!B6:J16","'Task_Inbox'!B18:J28","'Task_Master'!A1:J","'Weekly_Report_Log'!A1:E"];
 const query=new URLSearchParams();ranges.forEach(r=>query.append('ranges',r));query.set('valueRenderOption','FORMATTED_VALUE');
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id.trim())}/values:batchGet?${query}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 if(!response.ok)throw new Error(`Sheets 讀取失敗（HTTP ${response.status}）。請確認 API 已啟用、登入帳號有試算表讀取權限，以及試算表 ID 正確。`);
 const data=await response.json() as {valueRanges?:{values?:unknown[][]}[]};
 return mapSheetRows((data.valueRanges||[]).map(v=>v.values||[]));
}
