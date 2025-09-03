
import GrupoDetailServer from "./GrupoDetailServer";

import { GetServerSidePropsContext } from "next";

export default function Page(props: any) {
  return <GrupoDetailServer {...props} />;
}
