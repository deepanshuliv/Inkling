const LEGACY_PREFIX = 'my-lovable.';
const PREFIX = 'inkling.';

export const STORAGE_BOOT = `try{for(var k of Object.keys(localStorage)){if(k.indexOf('${LEGACY_PREFIX}')!==0)continue;var n='${PREFIX}'+k.slice(${LEGACY_PREFIX.length});if(localStorage.getItem(n)===null)localStorage.setItem(n,localStorage.getItem(k));localStorage.removeItem(k);}}catch(e){}`;
