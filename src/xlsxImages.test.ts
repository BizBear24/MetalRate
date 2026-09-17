import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import writeXlsxFile from 'write-excel-file/node';
import { extractSheetImages } from '@/services/storage/xlsxImages';

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const rels = (items: [string, string, string][]) =>
  `<?xml version="1.0"?><Relationships xmlns="${REL_NS}">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join('')}</Relationships>`;

function workbook(extra: Record<string, string | Uint8Array>, sheetXml: string) {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(rels([['rId1', 'worksheet', 'worksheets/sheet1.xml']])),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
  for (const [k, v] of Object.entries(extra)) files[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(files);
}

describe('extractSheetImages', () => {
  it('reads floating pictures written by a real xlsx writer', async () => {
    const buf = await writeXlsxFile([
      {
        sheet: 'Inventory',
        data: [[{ value: 'Barcode' }, { value: 'Photo' }], ['A1', null], ['B2', null], ['C3', null]],
        images: [
          { content: Buffer.from(PNG), contentType: 'image/png', width: 40, height: 40, dpi: 96, anchor: { row: 2, column: 2 } },
          { content: Buffer.from(PNG), contentType: 'image/png', width: 40, height: 40, dpi: 96, anchor: { row: 4, column: 9 } },
        ],
      },
      { sheet: 'Other', data: [['x']] },
    ]).toBuffer();
    const images = extractSheetImages(new Uint8Array(buf));
    const inv = images.get('Inventory')!;
    expect([...inv.keys()].sort()).toEqual([2, 4]);
    expect(inv.get(2)!.mime).toBe('image/png');
    expect(inv.get(2)!.data).toEqual(PNG);
    expect(images.has('Other')).toBe(false);
  });

  it('reads Excel 365 "Place in Cell" pictures', () => {
    const zip = workbook(
      {
        'xl/metadata.xml':
          '<metadata xmlns:xlrd="x"><metadataTypes count="1"><metadataType name="XLRICHVALUE"/></metadataTypes>' +
          '<futureMetadata name="XLRICHVALUE" count="2"><bk><extLst><ext><xlrd:rvb i="0"/></ext></extLst></bk><bk><extLst><ext><xlrd:rvb i="1"/></ext></extLst></bk></futureMetadata>' +
          '<valueMetadata count="2"><bk><rc t="1" v="0"/></bk><bk><rc t="1" v="1"/></bk></valueMetadata></metadata>',
        'xl/richData/rdrichvaluestructure.xml':
          '<rvStructures count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>',
        'xl/richData/rdrichvalue.xml': '<rvData count="2"><rv s="0"><v>0</v><v>5</v></rv><rv s="0"><v>1</v><v>5</v></rv></rvData>',
        'xl/richData/richValueRel.xml':
          '<richValueRels xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/><rel r:id="rId2"/></richValueRels>',
        'xl/richData/_rels/richValueRel.xml.rels': rels([
          ['rId1', 'image', '../media/image1.png'],
          ['rId2', 'image', '../media/image2.jpeg'],
        ]),
        'xl/media/image1.png': PNG,
        'xl/media/image2.jpeg': JPG,
      },
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="3"><c r="A3"/><c r="I3" t="e" vm="1"><v>#VALUE!</v></c></row>' +
        '<row r="7"><c r="I7" t="e" vm="2"><v>#VALUE!</v></c></row></sheetData></worksheet>',
    );
    const inv = extractSheetImages(zip).get('Inventory')!;
    expect(inv.get(3)).toMatchObject({ mime: 'image/png', data: PNG });
    expect(inv.get(7)).toMatchObject({ mime: 'image/jpeg', data: JPG });
  });

  it('reads WPS Office DISPIMG cell images', () => {
    const zip = workbook(
      {
        'xl/cellimages.xml':
          '<etc:cellImages xmlns:etc="e" xmlns:xdr="x" xmlns:a="a" xmlns:r="r"><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="ID_ABC123"/></xdr:nvPicPr>' +
          '<xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>',
        'xl/_rels/cellimages.xml.rels': rels([['rId1', 'image', 'media/image1.png']]),
        'xl/media/image1.png': PNG,
      },
      '<worksheet><sheetData><row r="5"><c r="A5"/><c r="I5" t="str"><f>_xlfn.DISPIMG(&quot;ID_ABC123&quot;,1)</f><v>=DISPIMG("ID_ABC123",1)</v></c></row></sheetData></worksheet>',
    );
    expect(extractSheetImages(zip).get('Inventory')!.get(5)).toMatchObject({ mime: 'image/png' });
  });

  it('ignores unsupported vector formats', () => {
    const zip = workbook(
      {
        'xl/worksheets/_rels/sheet1.xml.rels': rels([['rIdD', 'drawing', '../drawings/drawing1.xml']]),
        'xl/drawings/drawing1.xml':
          '<xdr:wsDr xmlns:xdr="x" xmlns:a="a" xmlns:r="r"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:to>' +
          '<xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>',
        'xl/drawings/_rels/drawing1.xml.rels': rels([['rId1', 'image', '../media/image1.emf']]),
        'xl/media/image1.emf': JPG,
      },
      '<worksheet><sheetData/></worksheet>',
    );
    expect(extractSheetImages(zip).size).toBe(0);
  });
});
