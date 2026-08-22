const panel = document.querySelector('#panel');
const selectionPill = document.querySelector('#selection-pill');

const RECIPES = [
  {
    id: 'talk',
    icon: '💬',
    title: 'Talk',
    subtitle: 'เข้าใกล้แล้วพูด',
    whenType: 'player_near',
    actionType: 'message',
    makeText: (name) => name === 'NPC' ? 'สวัสดี!' : `${name}: สวัสดี!`
  },
  {
    id: 'inspect',
    icon: '👀',
    title: 'Inspect',
    subtitle: 'แตะแล้วแสดงข้อความ',
    whenType: 'player_touch',
    actionType: 'message',
    makeText: (name) => `นี่คือ ${name}`
  },
  {
    id: 'collect',
    icon: '✨',
    title: 'Collect',
    subtitle: 'แตะแล้วเก็บ',
    whenType: 'player_touch',
    actionType: 'collect',
    makeText: (name) => `เก็บ ${name} แล้ว!`
  }
];

function currentSelection() {
  const id = selectionPill?.dataset.entityId;
  if (!id) return null;
  const project = window.Nuitool?.getProject?.();
  const entity = project?.entities?.find((item) => item.id === id);
  return entity ? { id, entity, project } : null;
}

function hasRecipe(project, targetId, recipe) {
  return (project?.rules || []).some((rule) =>
    rule.targetId === targetId &&
    rule.when?.type === recipe.whenType &&
    rule.action?.type === recipe.actionType
  );
}

function notify(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    if (toast.textContent === message) toast.classList.add('hidden');
  }, 1700);
}

function injectRecipes() {
  const composer = panel?.querySelector('.rule-composer');
  if (!composer || panel.querySelector('[data-logic-recipes]')) return;
  const selected = currentSelection();
  if (!selected) return;

  const wrap = document.createElement('div');
  wrap.dataset.logicRecipes = 'true';
  wrap.className = 'logic-recipes';
  wrap.innerHTML = `
    <div class="logic-recipes-head">
      <strong>Quick Logic</strong>
      <small>แตะครั้งเดียว แล้วค่อยแก้รายละเอียดได้</small>
    </div>
    <div class="logic-recipe-grid">
      ${RECIPES.map((recipe) => {
        const exists = hasRecipe(selected.project, selected.id, recipe);
        return `<button data-recipe="${recipe.id}" ${exists ? 'disabled' : ''}>
          <span>${recipe.icon}</span>
          <strong>${recipe.title}</strong>
          <small>${exists ? 'มีแล้ว ✓' : recipe.subtitle}</small>
        </button>`;
      }).join('')}
    </div>`;
  composer.before(wrap);

  wrap.querySelectorAll('[data-recipe]').forEach((button) => button.addEventListener('click', () => {
    const recipe = RECIPES.find((item) => item.id === button.dataset.recipe);
    const current = currentSelection();
    if (!recipe || !current) return;
    const name = current.entity.name || current.entity.type || 'Object';
    const created = window.Nuitool?.addRule?.(current.id, {
      whenType: recipe.whenType,
      actionType: recipe.actionType,
      text: recipe.makeText(name),
      name: `${recipe.title}: ${name}`
    });
    if (created) notify(`${recipe.icon} เพิ่ม ${recipe.title} แล้ว`);
  }));
}

const observer = new MutationObserver(injectRecipes);
if (panel) observer.observe(panel, { childList: true, subtree: true });
selectionPill?.addEventListener('click', () => setTimeout(injectRecipes, 0));
injectRecipes();
