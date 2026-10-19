// Theme management and registry for Sims 4 CC Manager
// 12 curated themes derived from modern color theory with Studio Titanium as default.

export const THEMES = [
  {
    id: 'studio-titanium',
    name: 'Studio Titanium (OLED)',
    nameRu: 'Студио Титаниум (OLED)',
    tag: 'default',
    tagRu: 'По умолчанию',
    descRu: 'Глубокий OLED-монохром с титановым платиновым акцентом и небесной подсветкой. Идеальная цветопередача для одежды и CAS.',
    descEn: 'Deep OLED monochrome with titanium platinum accents and sky blue highlights. Pure contrast for CAS & fashion.',
    preview: {
      accent: '#F8FAFC',
      accent2: '#38BDF8',
      bg: '#050505',
      card: '#121212',
      border: '#334155'
    }
  },
  {
    id: 'plumbob-og',
    name: 'Plumbob Green (OG)',
    nameRu: 'Классический Plumbob (OG)',
    tag: 'og',
    tagRu: 'OG Classic',
    descRu: 'Оригинальная изумрудная палитра Sims Plumbob. Фирменный зелёный кристалл и глубокий лесной фон.',
    descEn: 'Original Sims Plumbob emerald green palette. Iconic plumbob crystal and deep mineral base.',
    preview: {
      accent: '#10B981',
      accent2: '#34D399',
      bg: '#070b09',
      card: '#0c1310',
      border: '#047857'
    }
  },
  {
    id: 'amethyst',
    name: 'Velvet Amethyst',
    nameRu: 'Бархатный Аметист',
    descRu: 'Бархатный нео-аметист и лаванда. Стиль высокой моды, подиумный контраст для гардероба.',
    descEn: 'Velvet neo-amethyst & lavender. High fashion runway contrast.',
    preview: {
      accent: '#A855F7',
      accent2: '#C084FC',
      bg: '#09070F',
      card: '#120E20',
      border: '#7E22CE'
    }
  },
  {
    id: 'rose-wine',
    name: 'Rose Wine & Quartz',
    nameRu: 'Роза-Кварц и Вино',
    descRu: 'Гламурный ягодный роза-кварц. Эстетика макияжа, причёсок и нежного CAS.',
    descEn: 'Glamorous berry rose-quartz. Makeup, hair, and soft CAS aesthetic.',
    preview: {
      accent: '#BE185D',
      accent2: '#F472B6',
      bg: '#0D070B',
      card: '#1C0E17',
      border: '#9D174D'
    }
  },
  {
    id: 'haute-gold',
    name: 'Obsidian & Haute Gold',
    nameRu: 'Черный Оникс и Золото',
    descRu: 'Черный оникс и шампанское золото. Роскошный ювелирный минимализм с контрастными кнопками.',
    descEn: 'Onyx black and champagne gold. Luxury jewelry minimalism with crisp buttons.',
    preview: {
      accent: '#D97706',
      accent2: '#FBBF24',
      bg: '#0A0908',
      card: '#181512',
      border: '#B45309'
    }
  },
  {
    id: 'cyber-coral',
    name: 'Cyber Coral & Peony',
    nameRu: 'Кибер-Коралл и Пион',
    descRu: 'Симс-неон, коралл и розовая фуксия. Дерзкая трендовая энергетика Y2K.',
    descEn: 'Sims-neon, coral and hot peony. Bold Y2K gamer energy.',
    preview: {
      accent: '#F43F5E',
      accent2: '#FB7185',
      bg: '#0C080A',
      card: '#170E13',
      border: '#BE123C'
    }
  },
  {
    id: 'synthwave',
    name: 'Vapor Synthwave',
    nameRu: 'Вейпор Синтвейв',
    descRu: 'Электрик-маджента и неоновый циановый отблеск на полуночном фоне.',
    descEn: 'Electric magenta and cyan glow against midnight backdrops.',
    preview: {
      accent: '#EC4899',
      accent2: '#06B6D4',
      bg: '#0B0813',
      card: '#161025',
      border: '#BE185D'
    }
  },
  {
    id: 'cyber-lime',
    name: 'Cyber Lime & Matrix',
    nameRu: 'Кибер-Лайм и Матрица',
    descRu: 'Кислотный электро-лайм на темно-графитовом фоне с ультра-контрастным текстом.',
    descEn: 'Acid neon lime on dark graphite with ultra-high contrast dark typography.',
    preview: {
      accent: '#84CC16',
      accent2: '#A3E635',
      bg: '#080B07',
      card: '#11170E',
      border: '#65A30D'
    }
  },
  {
    id: 'cobalt-cyan',
    name: 'Electric Cobalt & Cyan',
    nameRu: 'Электрик Кобальт & Циан',
    descRu: 'Ледниковый циан и глубокий ультрамарин. Технологичный, чистый, быстрый стиль.',
    descEn: 'Glacial cyan and ultramarine blue. Crisp modern pro interface.',
    preview: {
      accent: '#06B6D4',
      accent2: '#38BDF8',
      bg: '#06080E',
      card: '#0D1322',
      border: '#0284C7'
    }
  },
  {
    id: 'raycast-indigo',
    name: 'Deep Space Indigo',
    nameRu: 'Космический Индиго',
    descRu: 'Глубокий чернильный индиго в стиле Linear и Raycast. Строгий софт для профессионалов.',
    descEn: 'Linear & Raycast-inspired deep space indigo. Sleek precision software.',
    preview: {
      accent: '#6366F1',
      accent2: '#818CF8',
      bg: '#070814',
      card: '#10132B',
      border: '#4338CA'
    }
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber & Espresso',
    nameRu: 'Закатный Янтарь и Эспрессо',
    descRu: 'Закатный янтарный неон на темном эспрессо. Теплый и ламповый свет для ночи.',
    descEn: 'Sunset amber glow on dark espresso. Warm, cozy night aesthetic.',
    preview: {
      accent: '#F59E0B',
      accent2: '#FBBF24',
      bg: '#0D0B08',
      card: '#1C160F',
      border: '#B45309'
    }
  },
  {
    id: 'midnight-mint',
    name: 'Midnight Plum & Mint',
    nameRu: 'Полночная Слива & Мята',
    descRu: 'Глубокая бархатная слива с контрастной освежающей мятой. Редкое и стильное сочетание.',
    descEn: 'Deep velvet plum paired with refreshing high-contrast mint.',
    preview: {
      accent: '#2DD4BF',
      accent2: '#5EEAD4',
      bg: '#0B080D',
      card: '#17101C',
      border: '#0F766E'
    }
  }
]

export const DEFAULT_THEME_ID = 'studio-titanium'

export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0]
}

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem('sims4cc_theme')
    if (saved && THEMES.some(t => t.id === saved)) {
      return saved
    }
  } catch {}
  return DEFAULT_THEME_ID
}

export function applyTheme(id) {
  const targetId = THEMES.some(t => t.id === id) ? id : DEFAULT_THEME_ID
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', targetId)
  }
  try {
    localStorage.setItem('sims4cc_theme', targetId)
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: targetId } }))
  }
  return targetId
}

export async function setAppTheme(id) {
  const activeId = applyTheme(id)
  try {
    await window.api?.setConfig?.('theme', activeId)
  } catch (err) {
    console.error('Failed to persist theme:', err)
  }
  return activeId
}
