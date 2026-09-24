'use client';

import { savingLabel } from '@/components/shared/save-submit';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { publishBulletinAction } from '@/lib/bulletins/actions';
import { toast } from 'sonner';

export function PublishBulletinForm({ unitId }: { unitId: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await publishBulletinAction({ unit_id: unitId, title, body });
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success('Bulletin published');
          setTitle('');
          setBody('');
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bulletin-title">Title</Label>
        <Input
          id="bulletin-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bulletin-body">Notice</Label>
        <Textarea
          id="bulletin-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {savingLabel(pending, 'Publish bulletin')}
      </Button>
    </form>
  );
}
