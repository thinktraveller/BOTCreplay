const text={type:'string',minLength:1};
const ids={type:'array',items:text,uniqueItems:true};
export const roleScopeSchema={
  $id:'botcreplay/role-scope/v1',type:'object',additionalProperties:false,
  required:['version','source','retired','cognitiveRoleIds','setupOutsiderOverrideRoleIds'],
  properties:{
    version:{const:'user-scope-20261018-v1'},source:text,
    retired:{type:'array',minItems:5,maxItems:5,items:{type:'object',additionalProperties:false,required:['roleId','entryId','name','reason'],properties:{roleId:text,entryId:{type:'string',pattern:'^S001-R-[TOMD][0-9]{3}$'},name:text,reason:text}}},
    cognitiveRoleIds:{...ids,minItems:4,maxItems:4},setupOutsiderOverrideRoleIds:{...ids,minItems:3,maxItems:3},
  },
};
