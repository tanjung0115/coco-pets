'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const release=process.argv.includes('--release'),check=process.argv.includes('--release-check');
if(release&&check)throw Error('Pilih --release atau --release-check.');
if(release){
 for(const key of ['COCO_KEYSTORE_PATH','COCO_KEYSTORE_PASSWORD','COCO_KEY_ALIAS','COCO_KEY_PASSWORD'])if(!process.env[key]?.trim())throw Error('Signing rilis memerlukan '+key+'.');
 if(!fs.existsSync(process.env.COCO_KEYSTORE_PATH))throw Error('Keystore tidak ditemukan.');
}
const env={...process.env,GRADLE_USER_HOME:path.join(root,'.gradle-cache')};
const studioJava='C:\\Program Files\\Android\\Android Studio\\jbr';
if(process.platform==='win32'&&fs.existsSync(studioJava))env.JAVA_HOME=studioJava;
const sdk=env.ANDROID_HOME||env.ANDROID_SDK_ROOT||(env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Android','Sdk'));
if(!sdk||!fs.existsSync(sdk))throw Error('Android SDK tidak ditemukan. Instal melalui Android Studio atau atur ANDROID_HOME.');
fs.writeFileSync(path.join(root,'android','local.properties'),'sdk.dir='+sdk.replaceAll('\\','/')+'\n');
function run(command,args,options={}){
 const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit',...options});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
run(process.execPath,[path.join(root,'node_modules','@capacitor','cli','bin','capacitor'),'sync','android']);
const tasks=release?['assembleRelease','bundleRelease']:check?['assembleRelease']:['assembleDebug'];
if(process.platform==='win32')run(process.env.ComSpec||'cmd.exe',['/d','/c','gradlew.bat '+tasks.join(' ')+' --no-daemon'],{cwd:path.join(root,'android')});
else run('./gradlew',[...tasks,'--no-daemon'],{cwd:path.join(root,'android')});
if(check){console.log('Validasi build release selesai; belum menjadi rilis yang ditandatangani.');process.exit(0);}
if(release){
 const output=path.join(root,'releases');fs.mkdirSync(output,{recursive:true});
 for(const [source,name] of [['apk/release/app-release.apk','coco-pets-release.apk'],['bundle/release/app-release.aab','coco-pets-release.aab']])fs.copyFileSync(path.join(root,'android/app/build/outputs',source),path.join(output,name));
 console.log('APK dan AAB rilis ditandatangani tersedia di releases/.');process.exit(0);
}
const destination=path.join(root,'releases','coco-pets-trial.apk');
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.copyFileSync(path.join(root,'android','app','build','outputs','apk','debug','app-debug.apk'),destination);
console.log('APK trial siap: '+destination);
