/* Trip Performance: read-only reporting over existing local trip data. */
(() => {
  "use strict";
  const money = n => new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(n);
  const pct = n => (100*n).toFixed(1)+"%";
  const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateList = (start,end) => {
    const out=[], d=new Date(start+"T12:00:00"), last=new Date(end+"T12:00:00");
    while(d<=last && out.length<401){out.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"));d.setDate(d.getDate()+1);}
    return out;
  };
  function render(){
    const host=document.getElementById("tripPerformance");if(!host)return;
    let data;try{data=JSON.parse(localStorage.getItem("tripBudgetApp.v1")||"null");}catch{}
    const trip=data?.trip, budget=trip?.budget;
    if(!budget?.configured){host.innerHTML='<p class="muted">Configure a trip budget to see performance.</p>';return;}
    const dates=dateList(trip.startDate,trip.endDate), total=Number(budget.totalBudget)||0;
    const expenses=Array.isArray(data.expenses)?data.expenses:[];
    const daily=dates.map(date=>expenses.filter(e=>e.date===date).reduce((a,e)=>a+(Number(e.audAmount)||0),0));
    const spent=expenses.reduce((a,e)=>a+(Number(e.audAmount)||0),0),remaining=total-spent;
    const today=new Date(), local=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
    const elapsed=dates.filter(d=>d<=local).length, future=dates.length-elapsed;
    const limits=budget.dailyLimits||{}, legacy=budget.day1HardLimit;
    const bases=dates.map((d,i)=> {
      const v=Object.prototype.hasOwnProperty.call(limits,d)?limits[d]:(i===0?legacy:null);
      return v===""||v===null||v===undefined?null:Math.max(0,Number(v)||0);
    });
    const fixed=bases.reduce((a,v)=>a+(v===null?0:v),0),auto=bases.filter(v=>v===null).length;
    const original=bases.map(v=>v===null?Math.max(0,total-fixed)/Math.max(1,auto):v);
    const avg=elapsed?daily.slice(0,elapsed).reduce((a,b)=>a+b,0)/elapsed:0;
    const projected=remaining-future*avg;
    const completed=dates.slice(0,elapsed), saved=completed.reduce((a,d,i)=>a+original[i]-daily[i],0);
    const originalRemaining=original.slice(elapsed).reduce((a,b)=>a+b,0);
    const futurePrepaid=expenses.filter(e=>e.date>local).reduce((a,e)=>a+(Number(e.audAmount)||0),0);
    const historical=completed.map((d,i)=>({date:d,day:i+1,spent:daily[i],plan:original[i]}));
    const highest=[...historical].sort((a,b)=>b.spent-a.spent).slice(0,3);
    const max=Math.max(1,...historical.flatMap(x=>[x.spent,x.plan]));
    host.innerHTML=`
      <div class="tp-perf-grid">
        <article class="panel"><p class="metric-label">Budget spent</p><h2>${money(spent)}</h2><p class="muted">${pct(total?spent/total:0)} of ${money(total)}</p></article>
        <article class="panel"><p class="metric-label">Remaining</p><h2>${money(remaining)}</h2><p class="muted">${future} days after today</p></article>
        <article class="panel"><p class="metric-label">Average per elapsed day</p><h2>${money(avg)}</h2><p class="muted">${elapsed} of ${dates.length} days</p></article>
        <article class="panel"><p class="metric-label">Projected end balance</p><h2>${money(projected)}</h2><p class="muted">At current daily average; not a spending target</p></article>
      </div>
      <section class="panel"><h3>Trip progress vs spending</h3>
        <div class="tp-perf-line"><span>Days elapsed</span><strong>${pct(dates.length?elapsed/dates.length:0)}</strong></div>
        <div class="tp-perf-track"><div style="width:${Math.min(100,100*elapsed/Math.max(1,dates.length))}%"></div></div>
        <div class="tp-perf-line"><span>Budget spent</span><strong>${pct(total?spent/total:0)}</strong></div>
        <div class="tp-perf-track"><div style="width:${Math.max(0,Math.min(100,100*spent/Math.max(1,total)))}%"></div></div>
      </section>
      <section class="panel"><h3>Original plan and redistribution</h3>
        <div class="tp-perf-line"><span>Original allocation for elapsed days</span><strong>${money(original.slice(0,elapsed).reduce((a,b)=>a+b,0))}</strong></div>
        <div class="tp-perf-line"><span>Actual spending on elapsed days</span><strong>${money(daily.slice(0,elapsed).reduce((a,b)=>a+b,0))}</strong></div>
        <div class="tp-perf-line"><span>Net unspent allocation so far</span><strong>${money(saved)}</strong></div>
        <div class="tp-perf-line"><span>Original allocation for future days</span><strong>${money(originalRemaining)}</strong></div>
        <p class="muted small">The net difference is money retained in the overall trip budget, not a separate pot of cash. Custom limits and expenses dated in the future affect the live rolling allowances.</p>
      </section>
      <section class="panel"><h3>Daily spending vs original allocation</h3>
        <div class="tp-perf-days">${historical.map(r=>`<div class="tp-perf-day"><span>Day ${r.day}</span><div><div class="tp-perf-bar plan" style="width:${100*r.plan/max}%"></div><div class="tp-perf-bar actual" style="width:${100*r.spent/max}%"></div></div><strong>${money(r.spent)}</strong></div>`).join("")||'<p class="muted">No days completed yet.</p>'}</div>
        <p class="muted small">Grey = original allocation; teal = actual spending. Original allocation is reconstructed from current custom limits and may differ if those limits were edited during the trip.</p>
      </section>
      <section class="panel"><h3>Highest spending days</h3>
        ${highest.map(r=>`<div class="tp-perf-line"><span>Day ${r.day} · ${esc(r.date)}</span><strong>${money(r.spent)}</strong></div>`).join("")||'<p class="muted">No completed days.</p>'}
        <h3 style="margin-top:18px">Projected finish</h3>
        ${[0.75,1,1.25].map(k=>`<div class="tp-perf-line"><span>${k===1?"Current average":k<1?"25% less per day":"25% more per day"} (${money(avg*k)}/day)</span><strong>${money(remaining-future*avg*k)}</strong></div>`).join("")}
        <p class="muted small">Projection uses remaining days after today and includes expenses already entered for future dates in the remaining balance (${money(futurePrepaid)}). It is an estimate, not a guarantee. Only spending recorded in this app is included.</p>
      </section>`;
  }
  document.addEventListener("click",e=>{if(e.target.closest('[data-budget-tab="performance"]'))render();});
  document.addEventListener("DOMContentLoaded",render);
  window.addEventListener("pageshow",render);
})();