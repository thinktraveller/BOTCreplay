const text={type:'string',minLength:1};
const list=(items:object)=>({type:'array',items});
const obj=(properties:Record<string,object>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const part={enum:['action','information','result','follow-up']};
const field=obj({label:text,control:text,detail:text,customOption:{const:'自定义'},customPart:part});
const custom=obj({choice:{const:'自定义'},parts:{...list(part),minItems:4,maxItems:4,uniqueItems:true},textRequired:{const:true},retainContext:{const:true},effects:{const:'explicit-only'},path:text,exampleText:text});
const requirement=obj({condition:text,source:text});
const formBase={branchId:text,label:text,timing:text,fields:{...list(field),minItems:1},path:text,sentences:{...list(text),minItems:1},exampleInput:text,exampleOutput:{...list(text),minItems:1},notes:text,custom};
const form={...obj({...formBase,detailRequirement:requirement,noEffectRequirement:requirement}),required:Object.keys(formBase)};
export const recordingFormatsSchema={
  $id:'botcreplay/recording-formats/v6',
  ...obj({version:{const:'m1-recording-v6'},commonForms:{...list(form),minItems:1},roles:{...list(obj({roleId:text,entryId:text,proposalVersion:{enum:['m1-action-v4','m1-action-v5','m1-action-v6']},customOption:{const:'自定义'},forms:list(form)})),minItems:197,maxItems:197}}),
};
