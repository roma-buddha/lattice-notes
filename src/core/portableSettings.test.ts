import {afterEach,expect,it,vi} from "vitest";
import {exportSettings,importSettings} from "../portableSettings";
afterEach(()=>vi.unstubAllGlobals());
it("exports only portable settings and remaps note references without exporting recovery drafts",()=>{
  const map=new Map<string,string>([
    ["notus-theme","dark"],
    ["lotus-bookmarks:old",'["Work/Notes/Hello.md"]'],
    ["notus-note-appearance:old:Work/Notes/Hello.md",'{"alignment":"left"}'],
    ["notus-draft:old:Work/Notes/Hello.md","private recovery"],
    ["other-app-token","secret"],
  ]);
  vi.stubGlobal("localStorage",{get length(){return map.size},key:(i:number)=>[...map.keys()][i],getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v)});
  vi.stubGlobal("window",{dispatchEvent:vi.fn()});
  const portable=exportSettings("old");
  expect(Object.keys(portable)).toHaveLength(3);
  importSettings(portable,"old","new");
  expect(map.get("lotus-bookmarks:new")).toBe('["Work/Notes/Hello.md"]');
  expect(map.get("notus-note-appearance:new:Work/Notes/Hello.md")).toBe('{"alignment":"left"}');
  importSettings({"other-app-token":"changed"},"old","new");
  expect(map.get("other-app-token")).toBe("secret");
});
