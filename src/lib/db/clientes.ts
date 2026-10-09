import { pool } from "~/lib/db/pool";
import { patronBusqueda } from "~/lib/db/busqueda";

/**
 * Los clientes, para el panel. La spec §8 lo dice tal cual: «nombre, correo
 * y teléfono, para conocerlos y poder llamar». Nada más.
 */
export type Cliente = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  /** Solo las cuentas de empresa (migración 021). */
  empresa: string | null;
  cif: string | null;
  rol: string | null;
  creadoEn: Date;
  /** Cuántos pedidos pagados lleva. Es la única cifra que pide el panel. */
  pedidos: number;
};

/**
 * El `where` de la búsqueda, compartido por la lista y la cuenta que pagina.
 * Parámetros $1 (patrón) y $2 (solo dígitos).
 */
const WHERE_BUSQUEDA = `
      where ($1::text is null
             or u.name ilike $1
             or u.email ilike $1
             or u.telefono ilike $1
             or u.empresa ilike $1
             or u.cif ilike $1
             -- El teléfono lo escribe el cliente al registrarse, con o sin
             -- espacios; si lo buscado son solo dígitos se compara sin
             -- separadores por ambos lados.
             or ($2::text is not null
                 and regexp_replace(u.telefono, '\\D', '', 'g') like '%' || $2 || '%'))`;

/**
 * Las columnas van nombradas una a una y jamás `select *`: la tabla `user`
 * es de Better Auth y puede crecer con campos que no deben salir de ahí.
 * La contraseña vive en `account`, y esta consulta no la toca.
 *
 * `texto` es la búsqueda libre del panel (nombre, correo o teléfono, con el
 * mismo criterio que en pedidos); vacío, devuelve a todos.
 */
export async function listarClientes(
  limite = 500,
  texto?: string,
  /** Cuántos saltarse, para paginar. */
  desplazamiento = 0,
): Promise<Cliente[]> {
  const busqueda = patronBusqueda(texto);
  const { rows } = await pool.query<Cliente>(
    `select u.id,
            u.name          as nombre,
            u.email,
            u.telefono,
            u.empresa,
            u.cif,
            u.rol,
            u."createdAt"   as "creadoEn",
            (select count(*)::int
               from pedidos p
              where p.user_id = u.id and p.estado = 'pagado') as pedidos
       from "user" u
     ${WHERE_BUSQUEDA}
      order by u."createdAt" desc, u.id
      limit $3 offset $4`,
    [busqueda.patron, busqueda.soloDigitos, limite, desplazamiento],
  );
  return rows;
}

/** Cuántos clientes casan con la búsqueda, para saber cuántas páginas hay. */
export async function contarClientes(texto?: string): Promise<number> {
  const busqueda = patronBusqueda(texto);
  const { rows } = await pool.query<{ total: string }>(
    `select count(*) as total from "user" u ${WHERE_BUSQUEDA}`,
    [busqueda.patron, busqueda.soloDigitos],
  );
  return Number(rows[0]?.total ?? 0);
}
