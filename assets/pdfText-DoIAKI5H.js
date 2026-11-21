import{_ as u}from"./index-D-EGNdt0.js";const _=6e4,f=200,p=/holdings|positions|portfolio|quantity|shares|units|market value|symbol|cusip|asset/gi;async function w(o){const s=await u(()=>import("./pdf-DpJgvHIh.js"),[]),d=(await u(async()=>{const{default:n}=await import("./pdf.worker.min-B57TMP24.js");return{default:n}},[])).default;s.GlobalWorkerOptions.workerSrc=d;const i=s.getDocument({data:await o.arrayBuffer()}),a=await i.promise,r=[];for(let n=1;n<=a.numPages;n++){const t=await(await a.getPage(n)).getTextContent();let e="";for(const c of t.items)"str"in c&&(e+=c.str,e+=c.hasEOL?`
`:" ");r.push(e.replace(/[ \t]+\n/g,`
`))}if(await i.destroy(),r.reduce((n,t)=>n+t.length,0)<f)throw new Error("This looks like a scanned or image-based PDF — no readable text was found. Download a text-based statement from your broker instead (OCR isn't supported).");return m(r)}function m(o,s=_){if(o.reduce((t,e)=>t+e.length,0)<=s)return{text:o.map((t,e)=>`[page ${e+1}]
${t}`).join(`

`),pageCount:o.length,droppedPages:[]};const i=o.map((t,e)=>({index:e,score:e===0?Number.POSITIVE_INFINITY:(t.match(p)??[]).length}));i.sort((t,e)=>e.score-t.score);const a=new Set;let r=0;for(const{index:t}of i){const e=o[t].length;r+e>s&&a.size>0||(a.add(t),r+=e)}const l=[...a].sort((t,e)=>t-e),n=o.map((t,e)=>e+1).filter(t=>!a.has(t-1));return{text:l.map(t=>`[page ${t+1}]
${o[t]}`).join(`

`),pageCount:o.length,droppedPages:n}}export{_ as MAX_STATEMENT_CHARS,w as extractPdfText,m as truncatePages};
