function entity(id, type, name, x, z, options = {}) {
  return {
    id,
    type,
    name,
    position: [x, options.y || 0, z],
    rotationY: options.rotationY || 0,
    scale: options.scale || 1,
    behavior: options.behavior || (type === 'player' ? 'player' : type === 'coin' ? 'spin' : 'stay'),
    interaction: options.interaction || null
  };
}

function project(name, ground, sky, entities) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: { name, createdAt: now, updatedAt: now },
    world: { ground, sky },
    entities
  };
}

const player = (x = 0, z = 5, rotationY = 180) => entity('player', 'player', 'Player', x, z, { rotationY });

export const GAME_TEMPLATES = [
  {
    id: 'blank',
    icon: '⬜',
    name: 'Blank World',
    subtitle: 'เริ่มจากโลกว่าง แล้วสร้างทุกอย่างเอง',
    tags: ['Sandbox', 'Empty'],
    make: () => project('Blank World', 'meadow', 'day', [player(0, 4)])
  },
  {
    id: 'cozy',
    icon: '🌿',
    name: 'Cozy Village',
    subtitle: 'หมู่บ้านเล็ก ๆ มี NPC ของสะสม และมุมพักผ่อน',
    tags: ['Cozy', 'Life'],
    make: () => project('Cozy Village', 'meadow', 'day', [
      player(0, 6),
      entity('home', 'house', 'Home', -5, -4, { rotationY: 12 }),
      entity('cottage-a', 'cottage', 'Cottage', 4.8, -4.2, { rotationY: -18 }),
      entity('well', 'well', 'Village Well', 0, -1.4),
      entity('bench-a', 'bench', 'Bench', -2.6, 1.2, { rotationY: 25 }),
      entity('lamp-a', 'lamp', 'Lamp', 2.7, 1.0),
      entity('sign-a', 'sign', 'Welcome Sign', 0, 3.1),
      entity('mia', 'npc', 'Mia', 2.4, -0.2, { behavior: 'wander', interaction: { type: 'talk', text: 'ยินดีต้อนรับสู่หมู่บ้านของเรา 🌱' } }),
      entity('noah', 'npc', 'Noah', -3.0, -1.1, { behavior: 'wander', interaction: { type: 'talk', text: 'ลองเดินสำรวจรอบ ๆ ดูนะ' } }),
      entity('tree-a', 'apple-tree', 'Apple Tree', -7.0, -1.0, { rotationY: 17 }),
      entity('tree-b', 'tree', 'Round Tree', 7.0, -1.7, { rotationY: -15 }),
      entity('tree-c', 'pine', 'Pine', 7.3, 3.5, { scale: .9 }),
      entity('bush-a', 'bush', 'Bush', -6.3, 3.2),
      entity('flowers-a', 'flowers', 'Flowers', -1.8, -3.1, { scale: 1.2 }),
      entity('flowers-b', 'flowers', 'Flowers', 1.5, -3.3),
      entity('pond-a', 'pond', 'Pond', 6.0, 6.4, { scale: .9 }),
      entity('coin-a', 'coin', 'Coin', 1.1, 2.5, { interaction: { type: 'collect', text: 'ได้เหรียญแล้ว +1 ✨' } }),
      entity('coin-b', 'coin', 'Coin', 2.3, 3.8, { interaction: { type: 'collect', text: 'ได้เหรียญแล้ว +1 ✨' } })
    ])
  },
  {
    id: 'adventure',
    icon: '⚔️',
    name: 'Fantasy Adventure',
    subtitle: 'เส้นทางสำรวจ ศัตรู ของรางวัล และประตูเวท',
    tags: ['Adventure', 'Fantasy'],
    make: () => project('Fantasy Adventure', 'stone', 'sunset', [
      player(0, 8),
      entity('portal-goal', 'portal', 'Ancient Portal', 0, -9, { scale: 1.15 }),
      entity('bridge-a', 'bridge', 'Old Bridge', 0, -3.5, { rotationY: 0 }),
      entity('chest-a', 'chest', 'Treasure Chest', -3.4, -6.6, { rotationY: 25 }),
      entity('campfire-a', 'campfire', 'Campfire', 3.8, 4.0),
      entity('guide', 'npc', 'Guide', -2.2, 5.2, { interaction: { type: 'talk', text: 'ตามทางหินไป แล้วหาประตูเวทให้เจอ!' } }),
      entity('slime-a', 'slime', 'Green Slime', -2.7, -1.1, { behavior: 'wander' }),
      entity('slime-b', 'slime', 'Green Slime', 3.0, -4.7, { behavior: 'wander', scale: 1.15 }),
      entity('slime-c', 'slime', 'Green Slime', 4.2, 1.1, { behavior: 'wander', scale: .9 }),
      entity('rock-a', 'rock', 'Moss Rock', -5.2, 0.0),
      entity('rock-b', 'rock', 'Moss Rock', 5.6, -2.0, { scale: 1.3 }),
      entity('pine-a', 'pine', 'Pine', -7.0, -4.0),
      entity('pine-b', 'pine', 'Pine', 7.2, -6.3, { scale: 1.2 }),
      entity('mushroom-a', 'mushroom', 'Mushroom', -4.7, 4.2, { scale: .8 }),
      entity('coin-a', 'coin', 'Coin', 0, 2.0, { interaction: { type: 'collect', text: 'Adventure coin +1' } }),
      entity('coin-b', 'coin', 'Coin', 0, -1.0, { interaction: { type: 'collect', text: 'Adventure coin +1' } }),
      entity('coin-c', 'coin', 'Coin', -2.3, -5.4, { interaction: { type: 'collect', text: 'Adventure coin +1' } })
    ])
  },
  {
    id: 'horror',
    icon: '👻',
    name: 'Night Mystery',
    subtitle: 'ฉากกลางคืนสำหรับเกมลึกลับ/สยองขวัญแบบเบา ๆ',
    tags: ['Mystery', 'Horror'],
    make: () => project('Night Mystery', 'dirt', 'night', [
      player(0, 7),
      entity('cottage-old', 'cottage', 'Old Cottage', 0, -6.0, { rotationY: 180, scale: 1.15 }),
      entity('door-a', 'door', 'Locked Door', 0, -3.3, { rotationY: 180 }),
      entity('lamp-a', 'lamp', 'Flickering Lamp', -3.2, 1.2),
      entity('lamp-b', 'lamp', 'Flickering Lamp', 3.2, -1.8),
      entity('sign-warning', 'sign', 'Warning Sign', 2.8, 4.1, { rotationY: -20 }),
      entity('stranger', 'npc', 'Stranger', -4.4, -3.1, { behavior: 'stay', interaction: { type: 'talk', text: 'ฉันได้ยินเสียงบางอย่างจากบ้านหลังนั้น…' } }),
      entity('shadow-a', 'slime', 'Shadow', 4.9, -5.8, { behavior: 'wander', scale: .75 }),
      entity('pine-a', 'pine', 'Dark Pine', -7.2, -1.8, { scale: 1.25 }),
      entity('pine-b', 'pine', 'Dark Pine', 7.0, -2.8, { scale: 1.15 }),
      entity('pine-c', 'pine', 'Dark Pine', -6.0, -7.2, { scale: .9 }),
      entity('rock-a', 'rock', 'Rock', 5.9, 3.5),
      entity('mushroom-a', 'mushroom', 'Mushroom', -2.0, 1.8, { scale: .7 }),
      entity('chest-clue', 'chest', 'Clue Chest', 3.3, -5.0, { scale: .8 }),
      entity('coin-clue', 'coin', 'Clue', -1.6, -4.3, { interaction: { type: 'collect', text: 'พบเบาะแสลึกลับ…' }, scale: .75 })
    ])
  }
];

export function findTemplate(id) {
  return GAME_TEMPLATES.find((template) => template.id === id) || null;
}
