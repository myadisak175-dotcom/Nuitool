const STORAGE_KEY = 'nuitool.onboarding.v1';

function closeWelcome() {
  document.querySelector('.nuitool-welcome')?.remove();
  try { localStorage.setItem(STORAGE_KEY, 'done'); } catch {}
}

function showWelcome() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'done') return;
  } catch {}

  const overlay = document.createElement('section');
  overlay.className = 'nuitool-welcome';
  overlay.innerHTML = `
    <div class="nuitool-welcome-card">
      <div class="nuitool-welcome-kicker">Nuitool v0.4</div>
      <h2>สร้างฉากแรกจากมือถือ</h2>
      <p>ลอง 3 อย่างนี้ แล้วกด Play ได้เลย</p>
      <div class="nuitool-steps">
        <div class="nuitool-step"><span>＋</span><div><strong>1. Add</strong><small>เลือกบ้าน ต้นไม้ ตัวละคร หรือของที่อยากใช้</small></div></div>
        <div class="nuitool-step"><span>✋</span><div><strong>2. ลากแล้ววาง</strong><small>ลากบนพื้นเพื่อหาตำแหน่ง แล้วปล่อยนิ้วเพื่อวาง</small></div></div>
        <div class="nuitool-step"><span>▶</span><div><strong>3. Play</strong><small>ทดลองเล่นทันที แล้วกลับมาแก้ต่อได้</small></div></div>
      </div>
      <div class="nuitool-welcome-actions">
        <button data-welcome-skip>ข้าม</button>
        <button data-welcome-start>เริ่มสร้าง</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-welcome-skip]')?.addEventListener('click', closeWelcome);
  overlay.querySelector('[data-welcome-start]')?.addEventListener('click', () => {
    closeWelcome();
    document.querySelector('[data-panel="add"]')?.click();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showWelcome, { once: true });
else showWelcome();
