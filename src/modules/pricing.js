import {all,put,del} from '../core/db.js';
import {num,uid} from '../core/utils.js';
export async function loadPricing(){return {tiers:await all('tiers'),settings:Object.fromEntries((await all('settings')).map(x=>[x.id,x.value]))}}
export function findTier(pre,type,tiers){return tiers.filter(x=>x.type===type&&x.enabled!==false).sort((a,b)=>num(a.from)-num(b.from)).find(x=>pre>=num(x.from)&&pre<=num(x.to))||null}
export function calcLine(line,settings,tiers,items){
 const unit=Math.max(1,num(line.unit)||1),qty=Math.max(0,num(line.qty)),purchaseCarton=Math.max(0,num(line.purchaseCartonPrice??line.cartonPrice));
 const purchasePerPiece=purchaseCarton/unit;
 const discountPercent=Math.max(0,num(line.discountRate??0));
 const discountFraction=discountPercent/100;
 const costPerPiece=Math.max(0,num(line.costPerPieceManual??(purchasePerPiece*(1-discountFraction))));
 const basis=settings.marginBasis==='purchase'?purchasePerPiece:costPerPiece;
 const rate=Math.max(0,num(settings.marginRate??.35));
 const pre=basis*(1+rate);
 const tier=findTier(pre,line.type,tiers);
 const manualText=String(line.manualFinalPrice??'').trim();
 const manual=manualText===''?null:num(manualText);
 const final=manual&&manual>0?manual:(tier?num(tier.price):null);
 const matches=(()=>{if(final==null)return [];if(tier&&tier.itemId){const linked=items.find(x=>x.id===tier.itemId);if(linked)return [linked]}return items.filter(x=>x.subCategory===line.type&&Math.abs(num(x.salePriceAfterDiscount??x.sellPrice)-final)<0.0001)})();
 const chosen=line.manualErpItemId?matches.find(x=>x.id===line.manualErpItemId):null;
 const item=chosen||matches[0]||null;
 const pieces=qty*unit,total=purchaseCarton*qty;
 let status='ok';
 if(manual&&manual>0)status=matches.length===0?'manual-no-item':(matches.length>1&&!chosen)?'multiple-match':'manual';
 else if(!tier)status='no-tier';else if(matches.length===0)status='no-item';else if(matches.length>1&&!chosen)status='multiple-match';
 return {...line,unit,qty,purchaseCartonPrice:purchaseCarton,cartonPrice:purchaseCarton,purchasePerPiece,costPerPiece,discountRate:discountPercent,basisPrice:basis,prePrice:pre,finalPrice:final,tierId:tier?.id||'',erpItemId:item?.id||'',erpName:item?.name||'',barcode:item?.barcode||'',itemId:item?.itemId||'',itemSaleBeforeDiscount:item?.salePriceBeforeDiscount??'',pieces,total,targetProfit:final==null?null:final-costPerPiece,targetMargin:final?((final-costPerPiece)/final):null,matchesCount:matches.length,matches:matches.map(x=>({id:x.id,name:x.name,supplier:x.supplier||'',itemId:x.itemId||''})),status}
}
export async function saveTier(t){return put('tiers',{...t,id:t.id||uid('tier')})}
export async function removeTier(id){return del('tiers',id)}
