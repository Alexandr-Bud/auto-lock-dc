/**
 * Auto Lock DC - модуль для автоматического назначения DC замков
 */

// ==================== КОНСТАНТЫ И НАСТРОЙКИ ====================

const LOCK_TYPES = {
  "simple": { dc: 10, label: "Простой замок" },
  "average": { dc: 15, label: "Обычный замок" },
  "good": { dc: 20, label: "Хороший замок" },
  "superior": { dc: 25, label: "Отличный замок" },
  "masterwork": { dc: 30, label: "Шедевральный замок" }
};

const i18n = {
  t: (key) => {
    return game.i18n.localize(key);
  }
};

// Использование в коде:
Hooks.once("init", function() {
  // Вместо русского текста напрямую
  console.log(i18n.t("AUTO_LOCK_DC.UI.PICK_LOCK")); // "Вскрыть замок"
  
  // В настройках
  game.settings.register("auto-lock-dc", "enableModule", {
    name: i18n.t("AUTO_LOCK_DC.SETTINGS.ENABLE"),
    hint: "Активировать все функции модуля",
    // ... остальные параметры
  });
});

// ==================== ХУКИ ====================

Hooks.once("init", function() {
  console.log("Auto Lock DC | Инициализация модуля");
  registerSettings();
});

Hooks.on("ready", function() {
  console.log("Auto Lock DC | Модуль готов к работе");
  
  // Добавляем обработчики для существующих дверей
  addLockButtonsToExistingDoors();
});

// Когда отрисовывается карточка предмета (двери)
Hooks.on("renderItemSheet", (app, html, data) => {
  // Проверяем, является ли предмет дверью
  if (data.item.type === "equipment" && data.item.name.toLowerCase().includes("дверь")) {
    addLockDCControls(app, html, data);
  }
});

// Когда отрисовывается контекстное меню токена
Hooks.on("getTokenContextMenuEntries", (entries, token) => {
  // Проверяем, является ли токен дверью
  if (token.actor?.type === "loot" || token.name?.toLowerCase().includes("дверь")) {
    entries.push({
      name: "Вскрыть замок",
      icon: "<i class='fas fa-lock-open'></i>",
      condition: () => game.user.isGM || token.isOwner,
      callback: () => handleLockPicking(token)
    });
  }
  return entries;
});

// ==================== НАСТРОЙКИ МОДУЛЯ ====================

function registerSettings() {
  // Настройка: базовая сложность замка
  game.settings.register("auto-lock-dc", "defaultLockDC", {
    name: "Базовая сложность замка",
    hint: "DC по умолчанию для обычных замков",
    scope: "world",
    config: true,
    type: Number,
    default: 15,
    range: {
      min: 5,
      max: 30,
      step: 5
    }
  });

  // Настройка: показывать кнопку на карточке
  game.settings.register("auto-lock-dc", "showOnItemSheet", {
    name: "Кнопка на карточке",
    hint: "Показывать кнопку вскрытия на карточке предмета",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Настройка: автоматически определять тип замка
  game.settings.register("auto-lock-dc", "autoDetectLock", {
    name: "Автоопределение замка",
    hint: "Определять тип замка по названию/описанию двери",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

/**
 * Добавляет кнопки управления DC на карточку двери
 */
function addLockDCControls(app, html, data) {
  if (!game.settings.get("auto-lock-dc", "showOnItemSheet")) return;

  const item = data.item;
  
  // Создаем HTML для кнопок
  const lockControlHtml = `
    <div class="form-group lock-dc-controls">
      <label>Сложность замка (DC)</label>
      <div class="form-fields">
        <input type="number" 
               class="lock-dc-input" 
               value="${getDoorLockDC(item)}" 
               min="5" max="30" step="5">
        <button type="button" class="calculate-dc">
          <i class="fas fa-calculator"></i>
        </button>
        <button type="button" class="pick-lock">
          <i class="fas fa-lock-open"></i> Вскрыть
        </button>
      </div>
      <p class="notes">Тип: ${getLockTypeFromDC(getDoorLockDC(item))}</p>
    </div>
  `;

  // Добавляем в карточку (перед кнопкой сохранения)
  html.find(".sheet-header").after(lockControlHtml);

  // Обработчики событий
  html.find(".calculate-dc").click(() => calculateAutoDC(item, html));
  html.find(".pick-lock").click(() => pickDoorLock(item));
}

/**
 * Определяет DC замка на основе свойств двери
 */
function getDoorLockDC(item) {
  // Проверяем, есть ли уже сохраненный DC
  if (item.flags?.["auto-lock-dc"]?.lockDC) {
    return item.flags["auto-lock-dc"].lockDC;
  }

  // Автоопределение по названию/описанию
  if (game.settings.get("auto-lock-dc", "autoDetectLock")) {
    const text = (item.name + " " + (item.system.description?.value || "")).toLowerCase();
    
    if (text.includes("простой") || text.includes("simple")) return 10;
    if (text.includes("хорош") || text.includes("good") || text.includes("качествен")) return 20;
    if (text.includes("отличн") || text.includes("superior") || text.includes("мастерск")) return 25;
    if (text.includes("шедевр") || text.includes("masterwork") || text.includes("эпический")) return 30;
  }

  // Возвращаем значение по умолчанию
  return game.settings.get("auto-lock-dc", "defaultLockDC");
}

/**
 * Автоматически вычисляет DC на основе свойств двери
 */
async function calculateAutoDC(item, html) {
  const material = item.system.properties?.has("material") || "";
  const value = item.system.price || 0;
  const rarity = item.system.rarity || "common";
  
  let calculatedDC = 15; // База
  
  // Модификаторы на основе материала
  if (material.includes("деревян")) calculatedDC = 10;
  if (material.includes("железн") || material.includes("железный")) calculatedDC = 15;
  if (material.includes("стальн") || material.includes("adamantine")) calculatedDC = 20;
  if (material.includes("магическ") || material.includes("magical")) calculatedDC += 5;
  
  // Модификаторы на основе редкости
  const rarityMod = {
    "common": 0,
    "uncommon": 5,
    "rare": 10,
    "veryRare": 15,
    "legendary": 20
  };
  calculatedDC += rarityMod[rarity] || 0;
  
  // Модификатор на основе цены
  if (value > 1000) calculatedDC += 5;
  if (value > 5000) calculatedDC += 5;
  
  // Ограничиваем диапазон
  calculatedDC = Math.max(10, Math.min(30, calculatedDC));
  
  // Обновляем поле ввода
  html.find(".lock-dc-input").val(calculatedDC);
  
  // Сохраняем в флагах предмета
  await item.setFlag("auto-lock-dc", "lockDC", calculatedDC);
  
  ui.notifications.info(`DC замка установлен: ${calculatedDC} (${getLockTypeFromDC(calculatedDC)})`);
}

/**
 * Обрабатывает попытку вскрытия замка
 */
async function pickDoorLock(item) {
  const lockDC = getDoorLockDC(item);
  
  // Создаем диалоговое окно для выбора персонажа
  const dialogContent = `
    <div class="lock-pick-dialog">
      <h2><i class="fas fa-lock"></i> Вскрытие замка</h2>
      <p><strong>Дверь:</strong> ${item.name}</p>
      <p><strong>Сложность (DC):</strong> ${lockDC} (${getLockTypeFromDC(lockDC)})</p>
      
      <div class="form-group">
        <label>Персонаж:</label>
        <select id="lock-picker-select">
          ${getPlayerCharactersOptions()}
        </select>
      </div>
      
      <div class="form-group">
        <label>Модификатор:</label>
        <input type="number" id="lock-pick-modifier" value="0">
      </div>
      
      <div class="form-group">
        <label>Преимущество:</label>
        <select id="lock-pick-advantage">
          <option value="none">Нет</option>
          <option value="advantage">Преимущество</option>
          <option value="disadvantage">Помеха</option>
        </select>
      </div>
    </div>
  `;
  
  new Dialog({
    title: "Вскрытие замка",
    content: dialogContent,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Бросить проверку",
        callback: async (html) => {
          const actorId = html.find("#lock-picker-select").val();
          const modifier = parseInt(html.find("#lock-pick-modifier").val()) || 0;
          const advantage = html.find("#lock-pick-advantage").val();
          
          await rollLockPickCheck(actorId, lockDC, modifier, advantage, item);
        }
      },
      cancel: {
        label: "Отмена"
      }
    },
    default: "roll"
  }).render(true);
}

/**
 * Бросок проверки на вскрытие замка
 */
async function rollLockPickCheck(actorId, lockDC, modifier, advantage, doorItem) {
  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.error("Персонаж не найден!");
    return;
  }
  
  // Определяем бонус владения воровскими инструментами
  let skillBonus = 0;
  let proficiency = "none";
  
  // Пытаемся найти навык "Воровские инструменты" (Thieves' Tools)
  const skills = actor.items.filter(item => 
    item.type === "tool" && 
    item.name.toLowerCase().includes("воровск") || 
    item.name.toLowerCase().includes("thieves")
  );
  
  if (skills.length > 0) {
    const tool = skills[0];
    proficiency = tool.system.proficient || "none";
    
    // Бонус мастерства
    const profBonus = actor.system.attributes.prof || 0;
    
    switch(proficiency) {
      case 0: // Нет
        skillBonus = 0;
        break;
      case 1: // Владение
        skillBonus = profBonus;
        break;
      case 2: // Эксперт
        skillBonus = profBonus * 2;
        break;
    }
    
    // Добавляем модификатор ловкости
    const dexMod = actor.system.abilities.dex.mod || 0;
    skillBonus += dexMod;
  }
  
  // Общий бонус
  const totalBonus = skillBonus + modifier;
  
  // Формируем бросок
  let rollFormula = "1d20";
  let flavor = "";
  
  switch(advantage) {
    case "advantage":
      rollFormula = "2d20kh";
      flavor = "С преимуществом";
      break;
    case "disadvantage":
      rollFormula = "2d20kl";
      flavor = "С помехой";
      break;
  }
  
  if (totalBonus !== 0) {
    rollFormula += totalBonus > 0 ? ` + ${totalBonus}` : ` ${totalBonus}`;
  }
  
  // Создаем и выполняем бросок
  const roll = new Roll(rollFormula);
  await roll.evaluate();
  
  // Определяем успех
  const total = roll.total;
  const success = total >= lockDC;
  
  // Создаем сообщение в чате
  const messageContent = `
    <div class="lock-pick-result ${success ? 'success' : 'failure'}">
      <h3><i class="fas fa-${success ? 'lock-open' : 'lock'}"></i> Попытка вскрыть замок</h3>
      <div class="result-details">
        <p><strong>Персонаж:</strong> ${actor.name}</p>
        <p><strong>Дверь:</strong> ${doorItem.name}</p>
        <p><strong>Сложность (DC):</strong> ${lockDC}</p>
        <p><strong>Бросок:</strong> ${roll.result} = ${total}</p>
        <p><strong>Владение инструментами:</strong> ${getProficiencyLabel(proficiency)}</p>
        <p><strong>Бонус ловкости:</strong> ${actor.system.abilities.dex.mod || 0}</p>
        <p><strong>Доп. модификатор:</strong> ${modifier}</p>
        <p><strong>Итог:</strong> ${success ? 
          `<span style="color: #4CAF50; font-weight: bold;">УСПЕХ! Замок вскрыт!</span>` : 
          `<span style="color: #f44336; font-weight: bold;">ПРОВАЛ! Замок не поддался.</span>`}
        </p>
        ${!success ? `<p class="notes">При провале на 5 и более можно сломать отмычку</p>` : ""}
      </div>
    </div>
  `;
  
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({actor: actor}),
    content: messageContent,
    flavor: `Вскрытие замка ${flavor ? `(${flavor})` : ''}`,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    roll: roll
  });
}

/**
 * Добавляет кнопки к существующим дверям на сцене
 */
function addLockButtonsToExistingDoors() {
  // Находим все двери на текущей сцене
  const doors = canvas.scene?.tokens.filter(token => 
    token.actor?.type === "loot" || 
    token.name?.toLowerCase().includes("дверь") ||
    token.name?.toLowerCase().includes("door")
  ) || [];
  
  // Для GM: добавляем HUD кнопки
  if (game.user.isGM && doors.length > 0) {
    console.log(`Auto Lock DC | Найдено ${doors.length} дверей на сцене`);
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Возвращает опции для выбора персонажей
 */
function getPlayerCharactersOptions() {
  const characters = game.actors.filter(actor => 
    actor.type === "character" && 
    actor.hasPlayerOwner
  );
  
  let options = '<option value="">-- Выберите персонажа --</option>';
  
  characters.forEach(actor => {
    // Проверяем, есть ли воровские инструменты
    const hasTools = actor.items.some(item => 
      item.type === "tool" && 
      (item.name.toLowerCase().includes("воровск") || 
       item.name.toLowerCase().includes("thieves"))
    );
    
    const toolIcon = hasTools ? '🔓' : '❌';
    options += `<option value="${actor.id}">${toolIcon} ${actor.name}</option>`;
  });
  
  return options;
}

/**
 * Получает текстовое описание типа замка по DC
 */
function getLockTypeFromDC(dc) {
  if (dc <= 10) return "Простой";
  if (dc <= 15) return "Обычный";
  if (dc <= 20) return "Хороший";
  if (dc <= 25) return "Отличный";
  return "Шедевральный";
}

/**
 * Получает текстовое описание уровня владения
 */
function getProficiencyLabel(level) {
  switch(level) {
    case 0: return "Нет";
    case 1: return "Владение";
    case 2: return "Эксперт";
    case 3: return "Мастер";
    default: return "Нет";
  }
}

// ==================== API МОДУЛЯ ====================

// Делаем функции модуля доступными для других модулей
Hooks.once("ready", () => {
  game.modules.get("auto-lock-dc").api = {
    getDoorLockDC: getDoorLockDC,
    pickDoorLock: pickDoorLock,
    calculateAutoDC: calculateAutoDC,
    
    // Утилиты для других модулей
    LOCK_TYPES: LOCK_TYPES,
    
    // Получить DC для конкретной двери
    getLockDCForItem: (itemId) => {
      const item = game.items.get(itemId);
      return item ? getDoorLockDC(item) : null;
    }
  };
  
  console.log("Auto Lock DC | API модуля загружен");
});