const unit=x=>Math.max(0,Math.min(1,Math.round((Number.isFinite(+x)?+x:.5)*20)/20));
export const SETUP_PRESETS=Object.freeze({balanced:{label:'Ausgewogen',suspension:.5,tyres:.5,brakes:.5},flow:{label:'Flow',suspension:.8,tyres:.35,brakes:.4},technical:{label:'Technik',suspension:.65,tyres:.9,brakes:.8}});
export function normalizeSetup(value={}){return {suspension:unit(value.suspension??.5),tyres:unit(value.tyres??.5),brakes:unit(value.brakes??.5)}}
export function setupSignature(value){const s=normalizeSetup(value);return [s.suspension,s.tyres,s.brakes].map(x=>Math.round(x*100)).join('-')}
export function setupLabel(value){const key=setupSignature(value);return Object.values(SETUP_PRESETS).find(p=>setupSignature(p)===key)?.label||'Individuell'}
export function setupParameters(value){const s=normalizeSetup(value);return {stiffness:220-100*s.suspension,damping:24,travel:.17+.08*s.suspension,compression:.8+.4*s.suspension,grip:.86+.28*s.tyres,rolling:.075+.03*s.tyres,brake:.72+.56*s.brakes,absorption:.9+.2*s.suspension}}
