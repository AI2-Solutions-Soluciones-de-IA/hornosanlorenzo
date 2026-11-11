/**
 * Borra la cuenta de un cliente que lo pide (derecho de supresión; lo promete
 * la política de privacidad, 11-11-2026). Sin `--confirmar` solo enseña lo
 * que haría.
 *
 *   pnpm borrar-cuenta correo@ejemplo.com                    → qué se borraría
 *   pnpm borrar-cuenta correo@ejemplo.com --confirmar        → la borra
 *   pnpm borrar-cuenta correo@ejemplo.com --confirmar --suscripcion
 *                                                            → y su suscripción
 *
 * Al borrar la fila de "user" la base borra en cascada sus sesiones, su
 * contraseña ("account") y sus direcciones guardadas. Los pedidos NO se
 * borran: hay que conservarlos seis años por las obligaciones contables
 * (`on delete set null`: se quedan sin cuenta, con los datos del pedido).
 * Una cuenta del panel (admin u oficina) no se borra desde aquí: primero se
 * le quita el papel con `pnpm admin <correo> cliente`.
 *
 * La suscripción de Wix (a donde se llevan los suscritos) se quita a mano.
 */
import pg from "pg";

const args = process.argv.slice(2);
const email = args
  .find((a) => !a.startsWith("--"))
  ?.trim()
  .toLowerCase();
const confirmar = args.includes("--confirmar");
const conSuscripcion = args.includes("--suscripcion");

if (!email) {
  console.error(
    "Uso: pnpm borrar-cuenta correo@ejemplo.com [--confirmar] [--suscripcion]",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

try {
  const { rows: usuarios } = await cliente.query(
    `select id, name, email, rol from "user" where lower(email) = $1`,
    [email],
  );
  const usuario = usuarios[0];
  const { rows: suscripciones } = await cliente.query(
    `select id, baja_en from suscriptores where lower(email) = $1`,
    [email],
  );

  console.log(`Base de datos: ${new URL(url).hostname}`);
  if (!usuario) {
    console.log(`No hay ninguna cuenta con ${email}.`);
  } else {
    const [{ n: direcciones }] = (
      await cliente.query(
        `select count(*)::int as n from direcciones where user_id = $1`,
        [usuario.id],
      )
    ).rows;
    const [{ n: pedidos }] = (
      await cliente.query(
        `select count(*)::int as n from pedidos where user_id = $1`,
        [usuario.id],
      )
    ).rows;
    console.log(
      `Cuenta: ${usuario.name} <${usuario.email}> (papel: ${usuario.rol ?? "cliente"})`,
    );
    console.log(
      `  Se borran: la cuenta, sus sesiones y ${direcciones} dirección(es) guardada(s).`,
    );
    console.log(
      `  Se conservan sin cuenta (obligación contable): ${pedidos} pedido(s).`,
    );
    if (usuario.rol && usuario.rol !== "cliente") {
      console.error(
        `\nEs una cuenta del panel (${usuario.rol}). Quítale antes el papel: pnpm admin ${email} cliente`,
      );
      process.exitCode = 1;
    }
  }
  console.log(
    suscripciones.length
      ? `Suscripción a las ofertas: ${suscripciones[0].baja_en ? "dada de baja" : "activa"}` +
          (conSuscripcion
            ? " → se borra."
            : " → se deja (añade --suscripcion para borrarla).")
      : "Sin suscripción a las ofertas.",
  );

  if (process.exitCode) {
    // Cuenta del panel: no se toca nada.
  } else if (!confirmar) {
    console.log(
      "\nNo se ha borrado nada. Repite con --confirmar para hacerlo.",
    );
  } else {
    await cliente.query("begin");
    if (usuario)
      await cliente.query(`delete from "user" where id = $1`, [usuario.id]);
    if (conSuscripcion)
      await cliente.query(`delete from suscriptores where lower(email) = $1`, [
        email,
      ]);
    await cliente.query("commit");
    console.log("\nHecho.");
    if (conSuscripcion && suscripciones.length) {
      console.log(
        "Recuerda quitarlo también de los contactos de Wix si ya se había llevado allí.",
      );
    }
  }
} catch (err) {
  await cliente.query("rollback").catch(() => {});
  console.error(
    "No se ha borrado nada:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
} finally {
  await cliente.end();
}
