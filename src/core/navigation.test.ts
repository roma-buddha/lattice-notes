import { describe,it,expect } from 'vitest';
import { websiteUrl } from './links';
import { externalMoves } from './fileChanges';
import type { Entry } from '../notus';
describe('website links',()=>{
  it('normalizes websites but not Markdown paths or unsafe schemes',()=>{
    expect(websiteUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(websiteUrl(' https://example.com ')).toBe('https://example.com/');
    expect(websiteUrl('Chapter.md')).toBeNull();
    expect(websiteUrl('../Folder/Note.md')).toBeNull();
    expect(websiteUrl('javascript:alert(1)')).toBeNull();
    expect(websiteUrl('file:///C:/secret')).toBeNull();
  });
});
const entry=(path:string,identity:string):Entry=>({name:path,path,identity,kind:'note',children:[]});
describe('external moves',()=>{
  it('follows unique identities without treating atomic edits as moves',()=>{
    expect([...externalMoves([entry('A','1')],[entry('B','1')])]).toEqual([['A','B']]);
    expect(externalMoves([entry('A','1')],[entry('A','2')]).size).toBe(0);
    expect(externalMoves([entry('A','1')],[entry('B','1'),entry('C','1')]).size).toBe(0);
  });
});
