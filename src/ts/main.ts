import { requireAuth } from "./vxid/checkSession";

requireAuth().then((session) => {
  if (!session) return;

  // ✅ Імпортуй модулі тільки після підтвердження
  import("./roboha/tablucya/tablucya");
/*   import("./roboha/tablucya/kalendar"); */
  import("./roboha/zakaz_narayd/vikno_klient_machuna");
  import("./roboha/zakaz_narayd/inichi_bazu_danux/inchi_bazu_danux");
  import("./roboha/nalachtuvannay/nalachtuvannay");
  import("./vxid/login");
  import("../scss/main.scss");

});
