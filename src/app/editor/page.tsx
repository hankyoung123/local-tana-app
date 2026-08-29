import { Toaster } from 'sonner';

import { PlateEditor } from '@/components/editor/plate-editor';

export default function Page() {
  return (
    <>
      <PlateEditor />
      <Toaster />
    </>
  );
}
