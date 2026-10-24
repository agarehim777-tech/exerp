import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Offline fixtures exercise the real UI components without reading or writing company data.
const repo = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(repo, 'test-results/ui-layout');
await fs.mkdir(output, { recursive: true });
const source = `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
  import {PageQueryProvider} from './src/shared/hooks/usePageQuery.jsx';
  import {Sidebar, Topbar, PageHeader} from './src/components/AppShell.jsx';
  import {pathForModule, moduleFromPath} from './src/config/routes.js';
  import SalesOrdersPage from './src/modules/sales/SalesOrdersPage.jsx';
  import CreditsPage from './src/pages/CreditsPage.jsx';
  import CashbookPage from './src/modules/finance/CashbookPage.jsx';
  import HrPage from './src/pages/HrPage.jsx';
  import DataTable from './src/shared/ui/DataTable.jsx';
  import {cashAmount} from './src/services/format.js';
  const noop=()=>{};
  const orders=Array.from({length:4},(_,i)=>({id:'order-'+i,order_no:'SF-100'+i,customer:{name:['Ağarəhim Rəhimov','Nərmin Məmmədova','Elçin Əliyev','Sevinc Quliyeva'][i]},total:20000+i*1200.25,paid_amount:1000,currency:'AZN',order_date:'2026-10-19',status:'confirmed',payment_status:'partial'}));
  const repository={orders,loading:false,hasMore:false,error:null,getById:async id=>orders.find(o=>o.id===id)};
  const credits=[{id:'credit-1',customer:'Ağarəhim Rəhimov',customerCode:'7623',contractId:'IN-1006',orderId:'order-0',orderNo:'SF-1000',device:'Lasercon V10',total:20000,months:18,initialPayment:5000,requiredInitial:5000,initialPaid:1000,date:'2026-10-19',startDate:null,started:false,status:'Başlanmamış',source:'sales',payments:[]}];
  const employees=[{id:'employee-1',name:'Nərmin Məmmədova',position:'Maliyyə mütəxəssisi',department:'Maliyyə',salary:1500,kpi:85},{id:'employee-2',name:'Elçin Əliyev',position:'Satış mütəxəssisi',department:'Satış',salary:1200,kpi:90}];
  function Host(){
    const location=useLocation(),navigate=useNavigate(),active=moduleFromPath(location.pathname);
    const module=active==='sales'?<SalesOrdersPage repository={repository}/>:active==='credits'?<CreditsPage credits={credits} onRefresh={noop} onStartCredit={noop} onPayCreditInitial={noop}/>:active==='hr'?<HrPage employees={employees} onEditEmployee={noop} onDeleteEmployee={noop}/>:<CashbookPage/>;
    return <div className="app-shell" data-fixture={location.pathname+location.search}><Sidebar active={active} onSelect={id=>navigate(pathForModule(id))} currentUser={{name:'Test operatoru'}} activeRole={{name:'Admin'}}/><div className="workspace"><Topbar query="" unread={0} messages={0} currentUser={{name:'Test operatoru'}} activeRole={{name:'Admin'}} canSwitchUser={false}/><main className="main"><PageHeader meta={{title:{sales:'Satışlar',credits:'Kreditlər',hr:'Əməkdaşlar',cashbook:'Kassa'}[active],subtitle:'',action:'Yeni qeyd'}}/>{module}</main></div></div>;
  }
  const root=createRoot(document.getElementById('root'));
  window.openFixture=entry=>root.render(<MemoryRouter key={entry} initialEntries={[entry]}><PageQueryProvider scope="fixture"><Host/></PageQueryProvider></MemoryRouter>);
  window.openSimpleTable=()=>root.render(<main className="main"><DataTable label="Sadə cədvəl" columns={[{key:'name',label:'Ad'},{key:'amount',label:'Məbləğ',align:'right'}]} rows={[{name:'Yekun',amount:cashAmount(1000)}]}/></main>);
`;
const fixtureBook = `
  const accounts=[{id:'cash',name:'Əsas kassa',type:'cash',currency:'AZN'}];
  export const useCashbook=()=>({accounts,balanceOf:()=>19000,ledgerReady:true,summary:{currencies:[{currency:'AZN',balance:19000,inflow:20000,outflow:1000,pending:1,refundPending:0}]},employees:[],customers:[],transactions:[{id:'tx',transaction_no:'KS-1001',occurred_at:'2026-10-19',account:accounts[0],direction:'in',amount:1000,counterparty:'Ağarəhim Rəhimov',reference:'SF-1000',category:'İlkin ödəniş',description:'Müqavilə üzrə ilkin ödəniş'}],expenses:[{id:'expense',account_id:'cash',category:'icarə',description:'Ofis icarəsi',amount:1000,expense_date:'2026-10-19',status:'pending'}],expenseCategories:[{id:'rent',name:'icarə'}]});
`;
const js = await build({ stdin: { contents: source, loader: 'jsx', resolveDir: repo }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'import.meta.env': JSON.stringify({BASE_URL:'/',DEV:false}), 'process.env.NODE_ENV':'"production"' }, loader: { '.css': 'empty' },
  plugins: [{ name: 'offline-fixtures', setup(builder) {
    builder.onResolve({ filter: /AuthProvider\.jsx$|useCashbook\.js$|OrderDrawer\.jsx$|integrations\/supabase\/client(?:\.ts)?$/ }, args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:repo,contents:args.path.includes('AuthProvider')
      ? 'export const useAuth=()=>({activeTenantId:"fixture",user:{id:"fixture"},activeMembership:{tenant_id:"fixture",role:"admin"}});'
      :args.path.includes('useCashbook')?fixtureBook:args.path.includes('OrderDrawer')
      ? 'export default function Drawer({order,onClose}){return <div role="dialog" aria-label="Sifariş"><b>{order.order_no}</b><button onClick={onClose}>Bağla</button></div>;}'
      :'export const supabase={};'}));
  }}] });
const css = await build({ stdin: { contents: '@import "./src/styles.css"; @import "./src/styles/index.css";', loader: 'css', resolveDir: repo }, bundle: true, write: false });
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext();
await context.route('**/*',route=>route.abort());
const page = await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const results=[];
try {
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({content:css.outputFiles[0].text});
  await page.addScriptTag({content:js.outputFiles[0].text});
  for(const width of [1440,1180,900,768,640,390,360]){
    await page.setViewportSize({width,height:900});
    for(const [name,url] of [['sales','/satis/sifarisler'],['credit','/kredit'],['accounts','/maliyye/kassa'],['transactions','/maliyye/kassa?tab=transactions'],['expenses','/maliyye/kassa?tab=expenses'],['hr','/hr/emekdaslar']]){
      await page.evaluate(url=>window.openFixture(url),url);
      await page.waitForFunction(url=>document.querySelector('[data-fixture]')?.getAttribute('data-fixture')===url,url);
      await page.locator(name==='hr'?'main .hr-platform-panel':'main table').first().waitFor();
      const result=await page.evaluate(()=>{
        const visible=el=>el.getBoundingClientRect().height>0&&getComputedStyle(el).visibility!=='hidden';
        const small=[...document.querySelectorAll('main *')].filter(el=>visible(el)&&el.childNodes.length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<11).map(el=>({text:el.textContent.slice(0,50),size:getComputedStyle(el).fontSize}));
        const tables=[...document.querySelectorAll('main table')].filter(visible).map(t=>({width:t.getBoundingClientRect().width,containerWidth:t.parentElement.clientWidth,rowHeights:[...t.querySelectorAll('tbody tr')].map(r=>r.getBoundingClientRect().height)}));
        return {pageWidth:document.documentElement.scrollWidth,small,tables,navLinks:document.querySelectorAll('nav a').length};
      });
      results.push({name,width,...result});
      if([1440,390].includes(width)||result.pageWidth>width)await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:true});
      assert.equal(result.pageWidth,width,`${name} page overflows at ${width}`);
      assert.deepEqual(result.small,[],`${name} has text below 11px at ${width}`);
      if(width<=640 && ['sales','credit','accounts'].includes(name))assert.ok(result.tables[0].width<=result.tables[0].containerWidth+1,`${name} compact table overflows at ${width}`);
    }
  }
  await page.evaluate(()=>window.openSimpleTable());
  await page.getByRole('region',{name:'Sadə cədvəl'}).waitFor();
  assert.ok(await page.locator('table').evaluate(el=>el.scrollWidth<=el.parentElement.clientWidth+1),'Simple tables must not inherit a wide minimum');
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>window.openFixture('/satis/sifarisler'));
  await page.getByRole('link',{name:'SF-1000',exact:true}).click();
  await page.getByRole('dialog',{name:'Sifariş'}).waitFor();
  await page.getByRole('button',{name:'Bağla',exact:true}).click();
  await page.getByRole('dialog',{name:'Sifariş'}).waitFor({state:'hidden'});
  assert.deepEqual(errors,[],'Fixture runtime errors');
} finally {
  await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify({source:'Offline real components, synthetic fixtures, network blocked',errors,results},null,2));
  await browser.close();
}
console.log(JSON.stringify({checked:results.length,screenshots:output,errors},null,2));
