import type { ScriptSnapshot } from '../domain/contracts.js';
import { getCurrentRule, getSourceRole, isRoleActive } from './catalog.js';

export type SetupTarget = 'outsider'|'minion'|'fixed-role'|'alignment'|'seating'|'information'|'cognition'|'registration'|'ability'|'condition'|'composition'|'custom';
export interface SetupAdjustment { sourceRoleId:string; target:SetupTarget; description:string; amount?:number; optionId?:string }
export interface SetupOption { id:string; target:SetupTarget; label:string; description:string; amounts?:number[]; defaultAmount?:number; overridesOutsiders?:boolean }
export interface SetupSource { roleId:string; name:string; ability:string; options:SetupOption[]; overridesOutsiders:boolean }
export const SETUP_TARGET_LABELS:Record<SetupTarget,string> = { outsider:'外来者数量',minion:'爪牙数量','fixed-role':'固定角色',alignment:'初始阵营',seating:'座位关系',information:'初始信息',cognition:'认知角色',registration:'干扰项',ability:'初始能力',condition:'初始状态',composition:'特殊配版',custom:'自定义设置' };
function quantityOptions(text:string):number[]|undefined {
  text=text.replaceAll('＋','+').replaceAll('－','-');
  const range=/([+-])(\d+)\s*[~～至]\s*(\d+)/.exec(text);
  if(range){const start=Number(range[2]),end=Number(range[3]);if(end>=start&&end-start<=15)return Array.from({length:end-start+1},(_,i)=>(start+i)*(range[1]==='-'?-1:1));}
  const values=[...text.matchAll(/[+-]\s*\d+/g)].map(match=>Number(match[0].replaceAll(' ','')));
  return values.length?[...new Set(values)]:undefined;
}
export function setupOptions(ability:string,setupFlag:unknown=false):SetupOption[] {
  const result:SetupOption[]=[];
  const add=(target:SetupTarget,description:string,overridesOutsiders=false)=>{
    if(result.some(item=>item.target===target&&item.description===description))return;
    const amounts=target==='outsider'||target==='minion'?quantityOptions(description):undefined;
    result.push({id:`setting-${result.length}`,target,label:description,description,...(amounts?{amounts,defaultAmount:amounts[0]}:{}),...(overridesOutsiders?{overridesOutsiders:true}:{})});
  };
  for(const match of ability.matchAll(/\[([^\]]+)\]|【([^】]+)】/g))for(const clause of (match[1]??match[2]).split(/[，,]/).map(text=>text.trim()).filter(Boolean)){
    if(/外来者/.test(clause)&&(/数量任意|任意数量|[-+]|－|＋/.test(clause)))add('outsider',clause,/数量任意|任意数量/.test(clause));
    else if(/爪牙/.test(clause)&&/[+\-＋－]\s*\d/.test(clause))add('minion',clause);
    else if(/邻座|邻近|正中/.test(clause))add('seating',clause);
    else if(/转变.*阵营|邪恶阵营/.test(clause))add('alignment',clause);
    else if(/无邪恶|无恶魔|多数玩家/.test(clause))add('composition',clause);
    else if(/醉酒|中毒/.test(clause))add('condition',clause);
    else if(/爪牙/.test(clause)&&/决定.*谁/.test(clause))add('composition',clause);
    else if(/^\+/.test(clause))add('fixed-role',clause);
    else add('custom',clause);
  }
  if(/干扰项|始终被你的能力当作恶魔/.test(ability))add('registration','选择实际干扰项玩家并填写依据');
  if(/你以为你是/.test(ability))add('cognition','选择实际认知角色、阵营及伪装信息');
  if(/你拥有一个.*角色的能力|恶魔拥有一个/.test(ability))add('ability','填写实际初始能力及其持有者');
  if(/恶魔.*知道.*你|恶魔知道.*在场|爪牙都知道|所有玩家都知道|互相认识|彼此认识/.test(ability))add('information','填写实际初始知情玩家及其收到的信息');
  if(/其他善良玩家醉酒/.test(ability))add('condition','填写实际初始醉酒玩家及来源');
  if(!result.length&&setupFlag)add('custom','按当前技能填写实际设置调整');
  if(result.length)result.push({id:'custom',target:'custom',label:'自定义设置调整',description:''});
  return result;
}
export function collectSetupSources(script:ScriptSnapshot,activeRoleIds:readonly string[]):SetupSource[] {
  const active=new Set(activeRoleIds);
  return script.roles.filter(entry=>active.has(entry.role.roleId)).flatMap(entry=>{
    const ability=entry.currentRule.abilityText,options=setupOptions(ability,entry.raw.setup);
    return options.length?[{roleId:entry.role.roleId,name:entry.role.name,ability,options,overridesOutsiders:options.some(option=>option.overridesOutsiders)}]:[];
  });
}
export function adjustmentFor(source:SetupSource,optionId=source.options[0]?.id):SetupAdjustment {
  const option=source.options.find(option=>option.id===optionId);
  if(!option)throw new Error('请选择该角色当前技能中的设置选项');
  return {sourceRoleId:source.roleId,target:option.target,optionId:option.id,description:option.description,...(option.defaultAmount!==undefined?{amount:option.defaultAmount}:{})};
}
export function resolveSetupAdjustments(activeRoleIds:readonly string[],adjustments:readonly SetupAdjustment[],script?:ScriptSnapshot) {
  const active=new Set(activeRoleIds);
  if(script){for(const id of active)if(!script.roles.some(entry=>entry.role.roleId===id))throw new Error('配版角色须存在于当前选择的剧本');}
  else for(const id of active)if(!isRoleActive(id))throw new Error('配版包含当前已移除或未知的角色');
  const selected:ScriptSnapshot=script??{originalJson:'',excluded:[],roles:[...active].map(id=>({role:{roleId:id,name:getSourceRole(id)!.name,type:getSourceRole(id)!.team,ruleVersion:getCurrentRule(id)!.version},raw:getSourceRole(id)! as ScriptSnapshot['roles'][number]['raw'],currentRule:getCurrentRule(id)!}))};
  const sources=collectSetupSources(selected,[...active]);
  const overridingRoleIds=sources.filter(source=>source.overridesOutsiders).map(source=>source.roleId);
  const accepted:SetupAdjustment[]=[],suppressed:SetupAdjustment[]=[];
  for(const item of adjustments){
    if(!Object.hasOwn(SETUP_TARGET_LABELS,item.target))throw new Error('未知的设置调整类型');
    if(!active.has(item.sourceRoleId)||!item.description.trim()||(item.amount!==undefined&&!Number.isSafeInteger(item.amount)))throw new Error('配版调整需要在场来源、完整说明及有效整数数量');
    const source=sources.find(source=>source.roleId===item.sourceRoleId);
    if(script&&!source)throw new Error('调整来源必须是实际在场且具有设置能力的角色');
    if(script&&!item.optionId&&!source!.options.some(option=>option.target===item.target))throw new Error('该角色当前版本没有这种设置调整能力');
    if(item.optionId){const option=source?.options.find(option=>option.id===item.optionId);if(!option||option.target!==item.target)throw new Error('设置选项与当前角色技能不一致，请重新选择');if(option.amounts&&!option.amounts.includes(item.amount!))throw new Error('调整数量不在当前技能允许的选项中');}
    const overridden=overridingRoleIds.length>0&&item.target==='outsider'&&!overridingRoleIds.includes(item.sourceRoleId);
    (overridden?suppressed:accepted).push(structuredClone(item));
  }
  return {accepted,suppressed,overridingRoleIds,requiresExplicitFinalCount:overridingRoleIds.length>0};
}
export function recommendedSetupCounts(count:number,base:readonly number[],policy:ReturnType<typeof resolveSetupAdjustments>,finalOutsiders?:number):number[] {
  if(policy.requiresExplicitFinalCount&&(!Number.isSafeInteger(finalOutsiders)||finalOutsiders!<0))throw new Error('请先填写实际最终外来者数量');
  if(policy.accepted.some(item=>item.target==='composition'))throw new Error('特殊配版请按实际裁决手动分配角色');
  const outsiders=policy.requiresExplicitFinalCount?finalOutsiders!:base[1]+policy.accepted.filter(item=>item.target==='outsider').reduce((sum,item)=>{if(!Number.isSafeInteger(item.amount))throw new Error('请填写外来者调整数量');return sum+item.amount!;},0);
  const minions=base[2]+policy.accepted.filter(item=>item.target==='minion').reduce((sum,item)=>{if(!Number.isSafeInteger(item.amount))throw new Error('请填写爪牙调整数量');return sum+item.amount!;},0);
  const result=[count-outsiders-minions-base[3],outsiders,minions,base[3]];
  if(result.some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('调整后的角色数量超出当前人数，请修改选择或手动配版');
  return result;
}
