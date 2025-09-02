import dynamic from "next/dynamic";
export default dynamic(() => import("@/components/maps/LocationPicker"), { ssr: false });
