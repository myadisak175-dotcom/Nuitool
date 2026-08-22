const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function prettySize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function countTriangles(json) {
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  let triangles = 0;
  let unknownPrimitives = 0;
  for (const mesh of Array.isArray(json.meshes) ? json.meshes : []) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      const mode = primitive?.mode ?? 4;
      if (mode !== 4) {
        unknownPrimitives += 1;
        continue;
      }
      const indexAccessor = Number.isInteger(primitive?.indices) ? accessors[primitive.indices] : null;
      const positionIndex = primitive?.attributes?.POSITION;
      const positionAccessor = Number.isInteger(positionIndex) ? accessors[positionIndex] : null;
      const count = Number(indexAccessor?.count ?? positionAccessor?.count ?? 0);
      if (count > 0) triangles += Math.floor(count / 3);
      else unknownPrimitives += 1;
    }
  }
  return { triangles, unknownPrimitives };
}

function scoreDoctor(metrics) {
  const issues = [];
  const tips = [];
  let severity = 0;

  if (metrics.fileBytes > 15 * 1024 * 1024) {
    severity = Math.max(severity, 2);
    issues.push(`ไฟล์ ${prettySize(metrics.fileBytes)} ค่อนข้างใหญ่สำหรับการโหลดผ่านมือถือ`);
    tips.push('ลด texture หรือ geometry ก่อนใช้หลายชิ้นในฉากเดียว');
  } else if (metrics.fileBytes > 8 * 1024 * 1024) {
    severity = Math.max(severity, 1);
    issues.push(`ไฟล์ ${prettySize(metrics.fileBytes)} ใช้ได้ แต่ควรเฝ้าดูเวลาโหลด`);
  }

  if (metrics.triangles > 250000) {
    severity = Math.max(severity, 2);
    issues.push(`ประมาณ ${metrics.triangles.toLocaleString()} triangles — หนักสำหรับ asset ที่ต้องวางซ้ำ`);
    tips.push('ทำ LOD หรือลด geometry ถ้าจะใช้หลาย instance');
  } else if (metrics.triangles > 120000) {
    severity = Math.max(severity, 1);
    issues.push(`ประมาณ ${metrics.triangles.toLocaleString()} triangles — เหมาะเป็นชิ้นหลักมากกว่าของที่วางเยอะ`);
  }

  if (metrics.materials > 40) {
    severity = Math.max(severity, 2);
    issues.push(`${metrics.materials} materials อาจเพิ่ม draw calls มากเกินไป`);
    tips.push('รวม material ที่ใช้ texture/คุณสมบัติใกล้กัน');
  } else if (metrics.materials > 20) {
    severity = Math.max(severity, 1);
    issues.push(`${metrics.materials} materials — ควรตรวจ draw calls ตอน Playtest`);
  }

  if (metrics.images > 24 || metrics.textures > 24) {
    severity = Math.max(severity, 2);
    issues.push(`มี texture/image จำนวนมาก (${Math.max(metrics.images, metrics.textures)})`);
    tips.push('รวม texture atlas หรือใช้ texture compression ในขั้น optimize');
  } else if (metrics.images > 12 || metrics.textures > 12) {
    severity = Math.max(severity, 1);
    issues.push(`มี texture/image ${Math.max(metrics.images, metrics.textures)} รายการ`);
  }

  if (metrics.unknownPrimitives > 0) {
    severity = Math.max(severity, 1);
    issues.push(`มี ${metrics.unknownPrimitives} primitive ที่ประเมิน triangle ไม่ได้ครบ`);
  }

  const status = severity === 0 ? 'ready' : severity === 1 ? 'check' : 'heavy';
  const label = status === 'ready' ? 'Mobile Ready' : status === 'check' ? 'Check' : 'Heavy';
  const icon = status === 'ready' ? '🟢' : status === 'check' ? '🟠' : '🔴';
  if (!issues.length) issues.push('โครงสร้างเบาพอสำหรับเริ่มทดสอบบนมือถือ');
  if (!tips.length) tips.push('ลอง Playtest บนมือถือจริงก่อนวาง asset นี้จำนวนมาก');
  return { status, label, icon, issues, tips };
}

export async function inspectGlb(file) {
  if (!(file instanceof Blob)) throw new Error('Choose a GLB file first.');
  if (file.size < 20) throw new Error('ไฟล์นี้เล็กเกินไปและไม่ใช่ GLB ที่สมบูรณ์');

  const headerBuffer = await file.slice(0, 20).arrayBuffer();
  const header = new DataView(headerBuffer);
  const magic = header.getUint32(0, true);
  const version = header.getUint32(4, true);
  const declaredLength = header.getUint32(8, true);
  const jsonLength = header.getUint32(12, true);
  const chunkType = header.getUint32(16, true);

  if (magic !== GLB_MAGIC) throw new Error('ไฟล์นี้ไม่มี GLB header ที่ถูกต้อง');
  if (version !== 2) throw new Error(`รองรับ GLB 2 เท่านั้น (ไฟล์นี้เป็น version ${version})`);
  if (chunkType !== JSON_CHUNK) throw new Error('GLB นี้ไม่มี JSON chunk แรกตามมาตรฐาน');
  if (declaredLength > file.size || declaredLength < 20) throw new Error('ขนาดที่ระบุใน GLB ไม่ตรงกับไฟล์จริง');
  if (!jsonLength || 20 + jsonLength > file.size) throw new Error('JSON chunk ของ GLB ไม่สมบูรณ์');

  let json;
  try {
    const jsonBytes = await file.slice(20, 20 + jsonLength).arrayBuffer();
    const text = new TextDecoder().decode(jsonBytes).replace(/\u0000+$/g, '').trim();
    json = JSON.parse(text);
  } catch {
    throw new Error('อ่านโครงสร้าง JSON ภายใน GLB ไม่ได้');
  }

  const { triangles, unknownPrimitives } = countTriangles(json);
  const metrics = {
    fileBytes: file.size,
    fileSize: prettySize(file.size),
    glbVersion: version,
    generator: String(json.asset?.generator || '').slice(0, 120),
    meshes: Array.isArray(json.meshes) ? json.meshes.length : 0,
    nodes: Array.isArray(json.nodes) ? json.nodes.length : 0,
    primitives: (json.meshes || []).reduce((sum, mesh) => sum + (Array.isArray(mesh?.primitives) ? mesh.primitives.length : 0), 0),
    triangles,
    unknownPrimitives,
    materials: Array.isArray(json.materials) ? json.materials.length : 0,
    textures: Array.isArray(json.textures) ? json.textures.length : 0,
    images: Array.isArray(json.images) ? json.images.length : 0,
    animations: Array.isArray(json.animations) ? json.animations.length : 0,
    skins: Array.isArray(json.skins) ? json.skins.length : 0
  };

  return {
    valid: true,
    inspectedAt: new Date().toISOString(),
    metrics,
    ...scoreDoctor(metrics)
  };
}

export function doctorSummary(doctor) {
  if (!doctor) return 'Not checked';
  return `${doctor.icon || '⚪'} ${doctor.label || 'Check'}`;
}
