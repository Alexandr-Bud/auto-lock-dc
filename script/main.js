/**
 * Auto Lock DC - модуль для автоматического назначения DC замков
 * Версия для Foundry v13
 */

// ==================== КОНСТАНТЫ И НАСТРОЙКИ ====================

const LOCK_TYPES = {
  "simple": { dc: 10, label: "Простой замок" },
  "average": { dc: 15, label: "Обычный замок" },
  "good": { dc: 20, label: "Хороший замок" },
  "superior": { dc: 25, label: "Отличный замок" },
  "masterwork": { dc: 30, label: "Шедевральный замок" }
};

// ==================== ХУКИ ====================

Hooks.once("init", function() {
  console.log("Auto Lock DC | Инициализация модуля для Foundry v13");
  registerSettings();
  
  // Предварительная загрузка локализации
  preloadLocalization();
});

Hooks.on("ready", function() {
  console.log("Auto Lock DC | Модуль готов к работе");
  
  // Добавляем обработчики для существующих дверей
  addLockButtonsToExistingDoors();
  
  // Инициализация API модуля
  initializeModuleAPI();
});

// Обработчик для стен/дверей на canvas
Hooks.on("canvasInit", () => {
  if (game.user.isGM && game.settings.get("auto-lock-dc", "autoAssignToWalls")) {
    setTimeout(() => {
      addDCToExistingWalls();
    }, 1000);
  }
});

// Когда отрисовывается карточка предмета
Hooks.on("renderItemSheet", (app, html, data) => {
  // Проверяем, является ли предмет дверью (более точная проверка)
  const itemTypes = ["equipment", "consumable", "tool", "loot"];
  if (itemTypes.includes(data.item.type)) {
    const itemName = data.item.name.toLowerCase();
    if (itemName.includes("дверь") || itemName.includes("door") || 
        data.item.system.description?.value.toLowerCase().includes("дверь") ||
        data.item.system.description?.value.toLowerCase().includes("door")) {
      addLockDCControls(app, html, data);
    }
  }
});

// Контекстное меню для токенов (для Foundry v13)
Hooks.on("getTokenDirectoryEntryContext", (html, menuItems) => {
  // Для меню токенов в директории
  return menuItems;
});

Hooks.on("getSceneControlButtons", (controls) => {
  // Можно добавить свою кнопку в панель управления сценой
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "assign-lock-dc",
      title: "Назначить DC замка",
      icon: "fas fa-lock",
      visible: game.user.isGM,
      onClick: () => assignLockDCToSelected()
    });
  }
});

// ==================== НАСТРОЙКИ МОДУЛЯ ====================

function registerSettings() {
  // Настройка: базовая сложность замка
  game.settings.register("auto-lock-dc", "defaultLockDC", {
    name: game.i18n.localize("AUTO_LOCK_DC.Settings.DefaultDC"),
    hint: game.i18n.localize("AUTO_LOCK_DC.Settings.DefaultDCHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 15,
    range: {
      min: 5,
      max: 30,
      step: 5
    },
    onChange: () => {}
  });

  // Настройка: показывать кнопку на карточке
  game.settings.register("auto-lock-dc", "showOnItemSheet", {
    name: game.i18n.localize("AUTO_LOCK_DC.Settings.ShowOnSheet"),
    hint: game.i18n.localize("AUTO_LOCK_DC.Settings.ShowOnSheetHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {}
  });

  // Настройка: автоматически определять тип замка
  game.settings.register("auto-lock-dc", "autoDetectLock", {
    name: game.i18n.localize("AUTO_LOCK_DC.Settings.AutoDetect"),
    hint: game.i18n.localize("AUTO_LOCK_DC.Settings.AutoDetectHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {}
  });
  
  // Настройка: автоматически назначать DC для стен на canvas
  game.settings.register("auto-lock-dc", "autoAssignToWalls", {
    name: game.i18n.localize("AUTO_LOCK_DC.Settings.AutoAssignWalls"),
    hint: game.i18n.localize("AUTO_LOCK_DC.Settings.AutoAssignWallsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {}
  });
}

function preloadLocalization() {
  // Загружаем локализацию при инициализации
  game.i18n.translations.AUTO_LOCK_DC = game.i18n.translations.AUTO_LOCK_DC || {};
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

/**
 * Добавляет кнопки управления DC на карточку двери
 */
function addLockDCControls(app, html, data) {
  if (!game.settings.get("auto-lock-dc", "showOnItemSheet")) return;

  const item = data.item;
  const lockDC = getDoorLockDC(item);
  
  // Создаем HTML для кнопок
  const lockControlHtml = `
    <div class="form-group lock-dc-controls" style="border-top: 2px solid #7c6c44; padding-top: 10px; margin-top: 10px;">
      <label style="font-weight: bold;">
        <i class="fas fa-lock"></i> ${game.i18n.localize("AUTO_LOCK_DC.UI.LockDC")}
      </label>
      <div class="form-fields" style="margin-top: 5px;">
        <input type="number" 
               class="lock-dc-input" 
               value="${lockDC}" 
               min="5" max="30" step="5"
               style="width: 80px; text-align: center;">
        <button type="button" class="calculate-dc" title="${game.i18n.localize("AUTO_LOCK_DC.UI.CalculateDC")}">
          <i class="fas fa-calculator"></i>
        </button>
        <button type="button" class="pick-lock" title="${game.i18n.localize("AUTO_LOCK_DC.UI.PickLock")}">
          <i class="fas fa-lock-open"></i>
        </button>
      </div>
      <p class="notes" style="font-size: 11px; margin-top: 5px;">
        ${game.i18n.localize("AUTO_LOCK_DC.UI.LockType")}: ${getLockTypeFromDC(lockDC)}
      </p>
    </div>
  `;

  // Добавляем в карточку (после основного заголовка)
  const header = html.find(".sheet-header");
  if (header.length) {
    header.after(lockControlHtml);
  } else {
    html.find(".tab[data-tab='description']").before(lockControlHtml);
  }

  // Обработчики событий
  html.find(".calculate-dc").click(() => calculateAutoDC(item, html));
  html.find(".pick-lock").click(() => pickDoorLock(item));
  
  // Обработчик изменения значения DC
  html.find(".lock-dc-input").change(async function() {
    const newDC = parseInt($(this).val());
    if (!isNaN(newDC) && newDC >= 5 && newDC <= 30) {
      await saveLockDC(item, newDC);
      html.find(".notes").text(`${game.i18n.localize("AUTO_LOCK_DC.UI.LockType")}: ${getLockTypeFromDC(newDC)}`);
    }
  });
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
    
    if (text.includes("простой") || text.includes("simple") || text.includes("рудиментарн")) return 10;
    if (text.includes("хорош") || text.includes("good") || text.includes("качествен") || text.includes("стандартн")) return 20;
    if (text.includes("отличн") || text.includes("superior") || text.includes("мастерск") || text.includes("крепк")) return 25;
    if (text.includes("шедевр") || text.includes("masterwork") || text.includes("эпическ") || text.includes("несокрушим")) return 30;
    if (text.includes("сложн") || text.includes("difficult") || text.includes("hard")) return 20;
    if (text.includes("легк") || text.includes("easy")) return 10;
  }

  // Возвращаем значение по умолчанию
  return game.settings.get("auto-lock-dc", "defaultLockDC");
}

/**
 * Сохраняет DC замка для предмета
 */
async function saveLockDC(item, dc) {
  try {
    await item.setFlag("auto-lock-dc", "lockDC", dc);
    ui.notifications.info(game.i18n.format("AUTO_LOCK_DC.Notification.DCSaved", { dc: dc }));
  } catch (error) {
    console.error("Auto Lock DC | Ошибка сохранения DC:", error);
    ui.notifications.error(game.i18n.localize("AUTO_LOCK_DC.Notification.SaveError"));
  }
}

/**
 * Автоматически вычисляет DC на основе свойств двери
 */
async function calculateAutoDC(item, html) {
  const material = item.system.properties?.has("material") || "";
  const value = item.system.price || 0;
  const rarity = item.system.rarity || "common";
  
  let calculatedDC = game.settings.get("auto-lock-dc", "defaultLockDC");
  
  // Модификаторы на основе материала
  const materialText = material.toString().toLowerCase();
  if (materialText.includes("деревян") || materialText.includes("wood")) calculatedDC = 10;
  if (materialText.includes("железн") || materialText.includes("iron") || materialText.includes("железный")) calculatedDC = 15;
  if (materialText.includes("стальн") || materialText.includes("steel")) calculatedDC = 20;
  if (materialText.includes("адамантин") || materialText.includes("adamantine")) calculatedDC = 25;
  if (materialText.includes("мифрил") || materialText.includes("mithril")) calculatedDC = 20;
  if (materialText.includes("магическ") || materialText.includes("magic")) calculatedDC += 5;
  
  // Модификаторы на основе редкости
  const rarityMod = {
    "common": 0,
    "uncommon": 5,
    "rare": 10,
    "veryRare": 15,
    "legendary": 20,
    "artifact": 25
  };
  calculatedDC += rarityMod[rarity] || 0;
  
  // Модификатор на основе цены
  if (value > 1000) calculatedDC += 5;
  if (value > 5000) calculatedDC += 5;
  if (value > 10000) calculatedDC += 5;
  
  // Ограничиваем диапазон
  calculatedDC = Math.max(5, Math.min(30, Math.round(calculatedDC / 5) * 5)); // Кратно 5
  
  // Обновляем поле ввода
  html.find(".lock-dc-input").val(calculatedDC);
  
  // Сохраняем
  await saveLockDC(item, calculatedDC);
  
  // Обновляем текст типа замка
  html.find(".lock-dc-controls .notes").text(
    `${game.i18n.localize("AUTO_LOCK_DC.UI.LockType")}: ${getLockTypeFromDC(calculatedDC)}`
  );
}

/**
 * Обрабатывает попытку вскрытия замка
 */
async function pickDoorLock(item) {
  const lockDC = getDoorLockDC(item);
  
  // Получаем персонажей игроков
  const characters = game.actors.filter(actor => 
    actor.type === "character" && 
    actor.hasPlayerOwner
  );
  
  if (characters.length === 0) {
    ui.notifications.warn(game.i18n.localize("AUTO_LOCK_DC.Notification.NoCharacters"));
    return;
  }
  
  // Создаем диалоговое окно
  const dialogContent = await renderTemplate("modules/auto-lock-dc/templates/lock-pick-dialog.html", {
    doorName: item.name,
    lockDC: lockDC,
    lockType: getLockTypeFromDC(lockDC),
    characters: characters.map(actor => ({
      id: actor.id,
      name: actor.name,
      hasTools: hasThievesTools(actor),
      dexMod: actor.system.abilities.dex.mod || 0
    })),
    i18n: game.i18n.translations.AUTO_LOCK_DC
  });
  
  new Dialog({
    title: game.i18n.localize("AUTO_LOCK_DC.UI.PickLockDialog"),
    content: dialogContent,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: game.i18n.localize("AUTO_LOCK_DC.UI.RollCheck"),
        callback: async (html) => {
          const actorId = html.find("#lock-picker-select").val();
          const modifier = parseInt(html.find("#lock-pick-modifier").val()) || 0;
          const advantage = html.find("#lock-pick-advantage").val();
          
          if (!actorId) {
            ui.notifications.error(game.i18n.localize("AUTO_LOCK_DC.Notification.SelectCharacter"));
            return;
          }
          
          await rollLockPickCheck(actorId, lockDC, modifier, advantage, item);
        }
      },
      cancel: {
        label: game.i18n.localize("AUTO_LOCK_DC.UI.Cancel")
      }
    },
    default: "roll",
    width: 500
  }).render(true);
}

/**
 * Бросок проверки на вскрытие замка
 */
async function rollLockPickCheck(actorId, lockDC, modifier, advantage, doorItem) {
  const actor = game.actors.get(actorId);
  if (!actor) {
    ui.notifications.error(game.i18n.localize("AUTO_LOCK_DC.Notification.ActorNotFound"));
    return;
  }
  
  // Определяем бонус владения воровскими инструментами
  const { skillBonus, proficiencyLevel, toolName } = getThievesToolsBonus(actor);
  
  // Общий бонус
  const dexMod = actor.system.abilities.dex.mod || 0;
  const totalBonus = skillBonus + dexMod + modifier;
  
  // Формируем бросок
  let rollFormula = "1d20";
  let flavor = "";
  
  switch(advantage) {
    case "advantage":
      rollFormula = "2d20kh";
      flavor = game.i18n.localize("AUTO_LOCK_DC.UI.WithAdvantage");
      break;
    case "disadvantage":
      rollFormula = "2d20kl";
      flavor = game.i18n.localize("AUTO_LOCK_DC.UI.WithDisadvantage");
      break;
  }
  
  if (totalBonus !== 0) {
    rollFormula += totalBonus > 0 ? ` + ${totalBonus}` : ` ${totalBonus}`;
  }
  
  // Создаем и выполняем бросок
  try {
    const roll = await new Roll(rollFormula).evaluate({async: true});
    
    // Определяем успех
    const total = roll.total;
    const success = total >= lockDC;
    
    // Создаем сообщение в чате
    await createLockPickChatMessage(actor, doorItem, lockDC, roll, total, success, {
      proficiencyLevel,
      toolName,
      dexMod,
      modifier,
      advantage,
      flavor
    });
    
  } catch (error) {
    console.error("Auto Lock DC | Ошибка броска:", error);
    ui.notifications.error(game.i18n.localize("AUTO_LOCK_DC.Notification.RollError"));
  }
}

/**
 * Создает сообщение в чате с результатом вскрытия
 */
async function createLockPickChatMessage(actor, doorItem, lockDC, roll, total, success, data) {
  const failureBy = lockDC - total;
  const showBreakWarning = !success && failureBy > 4;
  
  const templateData = {
    actorName: actor.name,
    doorName: doorItem.name,
    lockDC: lockDC,
    rollResult: roll.result,
    total: total,
    success: success,
    proficiency: getProficiencyLabel(data.proficiencyLevel),
    toolName: data.toolName || game.i18n.localize("AUTO_LOCK_DC.UI.NoTools"),
    dexMod: data.dexMod,
    modifier: data.modifier,
    advantage: data.advantage !== "none" ? data.flavor : "",
    showBreakWarning: showBreakWarning,  // ← ДОБАВЛЕНО
    i18n: game.i18n.translations.AUTO_LOCK_DC || {}
  };
  
  const content = await renderTemplate(
    "modules/auto-lock-dc/templates/lock-pick-result.html", 
    templateData
  );
  
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({actor: actor}),
    content: content,
    flavor: `${game.i18n.localize("AUTO_LOCK_DC.UI.LockPickAttempt")}${data.flavor ? ` (${data.flavor})` : ''}`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    roll: roll
  });
  
}

/**
 * Добавляет DC к существующим стенам на canvas
 */
async function addDCToExistingWalls() {
  if (!canvas.walls) return;
  
  let updatedCount = 0;
  const defaultDC = game.settings.get("auto-lock-dc", "defaultLockDC");
  
  for (const wall of canvas.walls.placeables) {
    if (wall.document.door && !wall.document.getFlag("auto-lock-dc", "lockDC")) {
      try {
        await wall.document.setFlag("auto-lock-dc", "lockDC", defaultDC);
        updatedCount++;
      } catch (error) {
        console.error("Auto Lock DC | Ошибка назначения DC стене:", error);
      }
    }
  }
  
  if (updatedCount > 0) {
    ui.notifications.info(game.i18n.format("AUTO_LOCK_DC.Notification.WallsUpdated", { count: updatedCount, dc: defaultDC }));
  }
}

/**
 * Назначает DC выбранным стенам
 */
async function assignLockDCToSelected() {
  const selected = canvas.walls.controlled;
  if (selected.length === 0) {
    ui.notifications.warn(game.i18n.localize("AUTO_LOCK_DC.Notification.NoWallsSelected"));
    return;
  }
  
  new Dialog({
    title: game.i18n.localize("AUTO_LOCK_DC.UI.AssignDC"),
    content: `
      <div>
        <p>${game.i18n.localize("AUTO_LOCK_DC.UI.AssignToSelected", { count: selected.length })}</p>
        <div class="form-group">
          <label>${game.i18n.localize("AUTO_LOCK_DC.UI.DCValue")}:</label>
          <input type="number" id="assign-dc-value" value="${game.settings.get("auto-lock-dc", "defaultLockDC")}" min="5" max="30" step="5">
        </div>
      </div>
    `,
    buttons: {
      assign: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize("AUTO_LOCK_DC.UI.Assign"),
        callback: async (html) => {
          const dc = parseInt(html.find("#assign-dc-value").val());
          if (isNaN(dc) || dc < 5 || dc > 30) {
            ui.notifications.error(game.i18n.localize("AUTO_LOCK_DC.Notification.InvalidDC"));
            return;
          }
          
          let assigned = 0;
          for (const wall of selected) {
            if (wall.document.door) {
              try {
                await wall.document.setFlag("auto-lock-dc", "lockDC", dc);
                assigned++;
              } catch (error) {
                console.error("Auto Lock DC | Ошибка назначения DC:", error);
              }
            }
          }
          
          ui.notifications.info(game.i18n.format("AUTO_LOCK_DC.Notification.DCAssigned", { count: assigned, dc: dc }));
        }
      },
      cancel: {
        label: game.i18n.localize("AUTO_LOCK_DC.UI.Cancel")
      }
    }
  }).render(true);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Проверяет, есть ли у актера воровские инструменты
 */
function hasThievesTools(actor) {
  return actor.items.some(item => 
    item.type === "tool" && 
    (item.name.toLowerCase().includes("воровск") || 
     item.name.toLowerCase().includes("thieves") ||
     item.name.toLowerCase().includes("lockpick"))
  );
}

/**
 * Получает бонус от воровских инструментов
 */
function getThievesToolsBonus(actor) {
  const tools = actor.items.filter(item => 
    item.type === "tool" && 
    (item.name.toLowerCase().includes("воровск") || 
     item.name.toLowerCase().includes("thieves") ||
     item.name.toLowerCase().includes("lockpick"))
  );
  
  if (tools.length === 0) {
    return { skillBonus: 0, proficiencyLevel: 0, toolName: null };
  }
  
  const tool = tools[0];
  const proficiency = tool.system.proficiency || 0;
  const profBonus = actor.system.attributes.prof || 0;
  
  let skillBonus = 0;
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
    case 3: // Мастер
      skillBonus = profBonus * 2; // В D&D5e нет отдельного бонуса для мастера
      break;
  }
  
  return {
    skillBonus,
    proficiencyLevel: proficiency,
    toolName: tool.name
  };
}

/**
 * Получает текстовое описание типа замка по DC
 */
function getLockTypeFromDC(dc) {
  if (dc <= 10) return game.i18n.localize("AUTO_LOCK_DC.LockType.Simple");
  if (dc <= 15) return game.i18n.localize("AUTO_LOCK_DC.LockType.Average");
  if (dc <= 20) return game.i18n.localize("AUTO_LOCK_DC.LockType.Good");
  if (dc <= 25) return game.i18n.localize("AUTO_LOCK_DC.LockType.Superior");
  return game.i18n.localize("AUTO_LOCK_DC.LockType.Masterwork");
}

/**
 * Получает текстовое описание уровня владения
 */
function getProficiencyLabel(level) {
  const labels = {
    0: game.i18n.localize("AUTO_LOCK_DC.Proficiency.None"),
    1: game.i18n.localize("AUTO_LOCK_DC.Proficiency.Proficient"),
    2: game.i18n.localize("AUTO_LOCK_DC.Proficiency.Expert"),
    3: game.i18n.localize("AUTO_LOCK_DC.Proficiency.Master")
  };
  return labels[level] || labels[0];
}

/**
 * Добавляет кнопки к существующим дверям
 */
function addLockButtonsToExistingDoors() {
  // Реализация для v13 может быть добавлена позже
}

// ==================== API МОДУЛЯ ====================

function initializeModuleAPI() {
  const api = {
    getDoorLockDC: getDoorLockDC,
    pickDoorLock: pickDoorLock,
    calculateAutoDC: calculateAutoDC,
    getLockTypeFromDC: getLockTypeFromDC,
    
    // Утилиты для других модулей
    LOCK_TYPES: LOCK_TYPES,
    
    // Получить DC для конкретной двери
    getLockDCForItem: (itemId) => {
      const item = game.items.get(itemId);
      return item ? getDoorLockDC(item) : null;
    },
    
    // Назначить DC предмету
    setLockDCForItem: async (itemId, dc) => {
      const item = game.items.get(itemId);
      if (item) {
        await saveLockDC(item, dc);
        return true;
      }
      return false;
    }
  };
  
  // Экспортируем API
  game.modules.get("auto-lock-dc").api = api;
  
  console.log("Auto Lock DC | API модуля загружен для Foundry v13");
}

// ==================== УТИЛИТЫ ДЛЯ РАЗРАБОТЧИКОВ ====================

// Глобальный экспорт для отладки
if (typeof window !== 'undefined') {
  window.AutoLockDC = {
    getDoorLockDC,
    calculateAutoDC,
    pickDoorLock,
    LOCK_TYPES
  };
}