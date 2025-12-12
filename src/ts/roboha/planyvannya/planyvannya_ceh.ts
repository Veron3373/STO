/**
 * Цей файл більше не використовується - функціонал перенесено в модалку поста
 * planyvannya_ceh.ts - залишено для сумісності
 */

// Експортуємо пусті інтерфейси для сумісності (якщо десь залишились імпорти)
export interface CehData {
  title: string;
}

export type CehSubmitCallback = (data: CehData) => void;
