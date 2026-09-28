import { worldToPlan } from './frame.js';

// Furniture/landscape presets in plan coordinates (rot = clockwise degrees, 0 = front faces plan south).
const W = (x, z) => worldToPlan(x, z);

export const STAGING = [
  {
    name: 'Open-concept main floor', level: 'main', desc: 'Kitchen in the old west wing, island, dining by the windows, living facing the fireplace.',
    items: [
      { type: 'kitchenRun', lv: 'main', x: 1.75, y: 22.5, rot: 270, color: '#f1efe9' },
      { type: 'fridge', lv: 'main', x: 2.2, y: 14.3, rot: 270 },
      { type: 'island', lv: 'main', x: 14.6, y: 21.0, rot: 90, color: '#34475e' },
      { type: 'barStool', lv: 'main', x: 16.8, y: 19.0, rot: 270 },
      { type: 'barStool', lv: 'main', x: 16.8, y: 21.0, rot: 270 },
      { type: 'barStool', lv: 'main', x: 16.8, y: 23.0, rot: 270 },
      { type: 'pendant', lv: 'main', x: 14.6, y: 19.5 },
      { type: 'pendant', lv: 'main', x: 14.6, y: 22.5 },
      { type: 'diningSet', lv: 'main', x: 16.0, y: 33.0, rot: 0, color: '#7a4f30' },
      { type: 'pendant', lv: 'main', x: 16.0, y: 33.0 },
      { type: 'rug810', lv: 'main', x: 30.2, y: 23.6, rot: 90, color: '#55657a' },
      { type: 'sofa', lv: 'main', x: 34.9, y: 23.6, rot: 90, color: '#7d8a93' },
      { type: 'coffeeTable', lv: 'main', x: 30.4, y: 23.6, rot: 90 },
      { type: 'armchair', lv: 'main', x: 29.0, y: 18.3, rot: 180, color: '#b5835a' },
      { type: 'armchair', lv: 'main', x: 29.0, y: 28.9, rot: 0, color: '#b5835a' },
      { type: 'floorLamp', lv: 'main', x: 36.5, y: 19.0 },
      { type: 'plant', lv: 'main', x: 36.6, y: 33.8 },
      { type: 'bookshelf', lv: 'main', x: 37.0, y: 28.0, rot: 90 },
      { type: 'ceilingFan', lv: 'main', x: 30.5, y: 23.6 },
      { type: 'patioSet', lv: 'main', x: 12.0, y: 5.8, rot: 0 },
      { type: 'plant', lv: 'main', x: 22.4, y: 1.8 },
    ],
  },
  {
    name: 'Bedrooms', level: 'upper', desc: 'King suite in the primary, queen + desk in bedroom 2, home office downstairs.',
    items: [
      { type: 'kingBed', lv: 'upper', x: 31.4, y: 26.0, rot: 180, color: '#8fa3b5' },
      { type: 'nightstand', lv: 'upper', x: 27.0, y: 28.8, rot: 180 },
      { type: 'nightstand', lv: 'upper', x: 35.8, y: 28.8, rot: 180 },
      { type: 'tableLamp', lv: 'upper', x: 27.0, y: 28.8, dy: 2.2 },
      { type: 'tableLamp', lv: 'upper', x: 35.8, y: 28.8, dy: 2.2 },
      { type: 'dresser', lv: 'upper', x: 29.0, y: 17.0, rot: 0 },
      { type: 'rug58', lv: 'upper', x: 31.4, y: 21.0, rot: 0, color: '#9c6b53' },
      { type: 'queenBed', lv: 'upper', x: 14.2, y: 26.0, rot: 180, color: '#c9b39a' },
      { type: 'nightstand', lv: 'upper', x: 11.2, y: 28.9, rot: 180 },
      { type: 'desk', lv: 'upper', x: 20.4, y: 20.9, rot: 0 },
      { type: 'officeChair', lv: 'upper', x: 20.4, y: 22.3, rot: 180 },
      { type: 'desk', lv: 'main', x: 32.0, y: 46.6, rot: 180 },
      { type: 'officeChair', lv: 'main', x: 32.0, y: 45.0, rot: 0 },
      { type: 'bookshelf', lv: 'main', x: 37.0, y: 41.0, rot: 90 },
      { type: 'armchair', lv: 'main', x: 28.3, y: 38.6, rot: 135 },
    ],
  },
  {
    name: 'Basement rec room', level: 'bsmt', desc: 'Sectional + TV, pool table under the bulkhead line, wet bar in the kitchenette.',
    items: [
      { type: 'sectional', lv: 'bsmt', x: 30.0, y: 41.8, rot: 0, color: '#a39c8f' },
      { type: 'tvStand', lv: 'bsmt', x: 30.0, y: 36.4, rot: 180 },
      { type: 'rug810', lv: 'bsmt', x: 30.0, y: 39.4, rot: 0, color: '#9c6b53' },
      { type: 'poolTable', lv: 'bsmt', x: 23.4, y: 36.5, rot: 90, color: '#1f6b3a' },
      { type: 'barCounter', lv: 'bsmt', x: 32.5, y: 14.3, rot: 0, color: '#2f3d4c' },
      { type: 'fridge', lv: 'bsmt', x: 36.2, y: 17.0, rot: 90 },
      { type: 'roundTable', lv: 'bsmt', x: 32.0, y: 22.0 },
    ],
  },
  {
    name: 'Kitchen garden', outdoor: true, desc: 'Six raised beds, bench and a 7-ft deer fence on the open south lawn.',
    items: (() => {
      const out = [];
      const [cx, cy] = W(60, 100);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push({ type: 'raisedBed', x: cx - 7 + i * 7, y: cy - 6 + j * 12, rot: 0, ground: true });
      out.push({ type: 'bench', x: cx, y: cy + 13, rot: 180, ground: true });
      out.push({ type: 'tree_apple', x: cx + 16, y: cy - 4, ground: true });
      out.push({ type: 'tree_apple', x: cx + 16, y: cy + 8, ground: true });
      out.push({ type: 'beehive', x: cx - 16, y: cy + 10, rot: 90, ground: true });
      return out;
    })(),
  },
  {
    name: 'Fire-pit terrace', outdoor: true, desc: 'Fire pit ring with chairs, lamp posts and a pergola by the walkout patio.',
    items: (() => {
      const [cx, cy] = W(55, 55);
      return [
        { type: 'firePit', x: cx, y: cy, rot: 0, ground: true },
        { type: 'lampPost', x: cx - 10, y: cy - 9, ground: true },
        { type: 'lampPost', x: cx + 10, y: cy + 9, ground: true },
        { type: 'pergola', x: 49, y: 42, rot: 0, ground: true },
        { type: 'shrub_hydrangea', x: cx - 11, y: cy + 4, ground: true },
        { type: 'shrub_hydrangea', x: cx + 11, y: cy - 4, ground: true },
        { type: 'shrub_grass', x: cx + 4, y: cy + 11, ground: true },
      ];
    })(),
  },
  {
    name: 'Privacy screen', outdoor: true, desc: 'Row of Green Giant arborvitae along the east drive.',
    items: Array.from({ length: 9 }, (_, i) => { const [x, y] = W(70 + i * 9, -52); return { type: 'tree_arborvitae', x, y, ground: true }; }),
  },
];
