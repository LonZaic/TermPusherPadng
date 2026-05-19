interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  isDeleted?: boolean;
  groupIds?: string[];
  boundElements?: Array<{ id: string; type: string }> | null;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  containerId?: string | null;
  points?: Array<[number, number]>;
  startBinding?: { elementId: string; focus?: number; gap?: number } | null;
  endBinding?: { elementId: string; focus?: number; gap?: number } | null;
  lastCommittedPoint?: [number, number] | null;
  roundness?: { type: number } | null;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toHex(c: string): string {
  if (!c || c === 'transparent') return 'none';
  if (c.startsWith('#')) return c;
  // Excalidraw uses CSS named colors too, but we'll just pass through
  return c;
}

function buildVertexStyle(el: ExcalidrawElement): string {
  const parts: string[] = [];
  const fill = toHex(el.backgroundColor || '');
  const stroke = toHex(el.strokeColor || '#000000');

  parts.push(`fillColor=${fill}`);
  parts.push(`strokeColor=${stroke}`);
  parts.push(`strokeWidth=${el.strokeWidth || 1}`);
  if (el.opacity && el.opacity < 100) parts.push(`opacity=${el.opacity}`);
  parts.push('whiteSpace=wrap');
  parts.push('html=1');

  switch (el.type) {
    case 'rectangle':
      parts.push(el.roundness ? 'rounded=1' : 'rounded=0');
      break;
    case 'diamond':
      parts.push('shape=rhombus');
      parts.push('perimeter=rhombusPerimeter');
      break;
    case 'ellipse':
      parts.push('shape=ellipse');
      parts.push('perimeter=ellipsePerimeter');
      break;
    case 'text':
      parts.push('text');
      parts.push('strokeColor=none');
      parts.push('fillColor=none');
      parts.push('align=left');
      parts.push('verticalAlign=top');
      parts.push('resizable=0');
      parts.push('autosize=1');
      parts.push('points=[]');
      break;
    default:
      parts.push('rounded=0');
      break;
  }

  return parts.join(';');
}

export function exportToDrawio(elements: ExcalidrawElement[]): string {
  const cells: string[] = [];
  let nextId = 2; // 0 and 1 are reserved (root + default layer)

  // Build id map: excalidraw id → mxCell id
  const idMap = new Map<string, number>();

  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === 'freedraw' || el.type === 'image' || el.type === 'frame') continue;
    if (el.containerId) continue; // text inside shapes — handled by parent

    const mxId = nextId++;
    idMap.set(el.id, mxId);

    if (el.type === 'arrow' || el.type === 'line') {
      // Edge
      const sourceMxId = el.startBinding ? idMap.get(el.startBinding.elementId) : null;
      const targetMxId = el.endBinding ? idMap.get(el.endBinding.elementId) : null;

      const styleParts: string[] = [
        'edgeStyle=orthogonalEdgeStyle',
        'rounded=0',
        'orthogonalLoop=1',
        'jettySize=auto',
        'html=1',
      ];
      if (el.strokeColor) styleParts.push(`strokeColor=${toHex(el.strokeColor)}`);
      if (el.strokeWidth) styleParts.push(`strokeWidth=${el.strokeWidth}`);

      const value = ''; // edge labels not extracted here
      const style = styleParts.join(';');

      const pts = el.points || [];
      let geometryXML = '';
      if (sourceMxId && targetMxId) {
        geometryXML = `<mxGeometry relative="1" as="geometry">
  <mxPoint x="${Math.round(el.x)}" y="${Math.round(el.y)}" as="sourcePoint" />
  <mxPoint x="${Math.round(el.x + el.width)}" y="${Math.round(el.y + el.height)}" as="targetPoint" />`;
        if (pts.length > 2) {
          geometryXML += `\n  <Array as="points">`;
          for (let i = 1; i < pts.length - 1; i++) {
            geometryXML += `\n    <mxPoint x="${Math.round(pts[i][0])}" y="${Math.round(pts[i][1])}" />`;
          }
          geometryXML += `\n  </Array>`;
        }
        geometryXML += `\n</mxGeometry>`;
      } else {
        geometryXML = `<mxGeometry relative="1" as="geometry">
  <mxPoint x="${Math.round(el.x)}" y="${Math.round(el.y)}" as="sourcePoint" />
  <mxPoint x="${Math.round(el.x + el.width)}" y="${Math.round(el.y + el.height)}" as="targetPoint" />
</mxGeometry>`;
      }

      cells.push(`<mxCell id="${mxId}" value="${escXml(value)}" edge="1"${sourceMxId ? ` source="${sourceMxId}"` : ''}${targetMxId ? ` target="${targetMxId}"` : ''} style="${style}">
  ${geometryXML}
</mxCell>`);
    } else {
      // Vertex
      const value = el.text ? escXml(el.text) : '';
      const style = buildVertexStyle(el);
      const w = Math.round(el.width);
      const h = Math.round(el.height);
      const x = Math.round(el.x);
      const y = Math.round(el.y);

      cells.push(`<mxCell id="${mxId}" value="${value}" vertex="1" style="${style}">
  <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />
</mxCell>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="TermPusherPad" version="21.0.0">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  return xml;
}
