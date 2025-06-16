// src/ts/roboha/tablucya/kalendar.js
import $ from 'jquery';
import moment from 'moment';
import 'daterangepicker';

$(function () {
  $('#dateRangePicker').daterangepicker({
    locale: {
      format: 'DD.MM.YYYY',
      applyLabel: 'Прийняти',
      cancelLabel: 'Відмінити',
      daysOfWeek: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
      monthNames: [
        'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
      ],
      firstDay: 1
    },
    opens: 'center',
    autoUpdateInput: true,
    startDate: moment().subtract(7, 'days'),
    endDate: moment(),
  });
});
