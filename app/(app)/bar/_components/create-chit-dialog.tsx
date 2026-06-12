'use client';

import { useActionState, useState, useMemo } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldLabel,
} from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { FormError } from '@/components/shared/form-error';
import { createBarChitAction } from '@/lib/bar/actions';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Loader2, Trash2, Search, ShoppingCart, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// Type definitions matching queries
type InventoryItem = {
  id: string | null; // lot ID in unit_inventory
  item_id: string | null; // actual variant ID
  item_name: string | null;
  qty_packs: number | string | null;
  rate: number | string | null;
  pack_label: string | null;
  category: string | null;
  volume_ml?: number | string | null;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  rank: string | null;
  service_no: string | null;
};

type ActiveBooking = {
  id: string;
  guest_name: string;
  room_name: string;
  status: string;
};

interface CreateChitDialogProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  inventory: InventoryItem[];
  members: Member[];
  bookings: ActiveBooking[];
}

type ChitLineItem = {
  variant_id: string;
  lot_id: string;
  quantity: number;
  rate: number;
  name: string;
  availableStock: number;
  unit: 'bottle' | 'peg';
  volume_ml: number;
};

function getBaseUnitName(packLabel: string | null) {
  if (!packLabel) return 'Bottle';
  const label = packLabel.toUpperCase();
  if (label.includes('BOTTLE')) return 'Bottle';
  if (label.includes('CAN')) return 'Can';
  if (label.includes('PACKET')) return 'Packet';
  if (label.includes('BOX')) return 'Box';
  return 'Piece';
}

export function CreateChitDialog({
  open,
  onClose,
  unitId,
  inventory,
  members,
  bookings,
}: CreateChitDialogProps) {
  const [consumerType, setConsumerType] = useState<'member' | 'guest'>('member');
  const [profileId, setProfileId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [lines, setLines] = useState<ChitLineItem[]>([]);

  const [openMemberPicker, setOpenMemberPicker] = useState(false);
  const [openBookingPicker, setOpenBookingPicker] = useState(false);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'alcohol' | 'cigar' | 'grocery' | 'soft_drink'>('all');

  const selectedMember = useMemo(() => members.find(m => m.id === profileId), [members, profileId]);
  const selectedBooking = useMemo(() => bookings.find(b => b.id === bookingId), [bookings, bookingId]);

  // Aggregate items in inventory by variant so we don't list multiple lots separately in the picker.
  // Instead, show total available quantity per variant, and use the lot's rate.
  // Note: if there are multiple lots with different rates for the same variant, we use the FIFO lot's rate.
  const aggregatedInventory = useMemo(() => {
    return inventory.map(lot => {
      if (!lot.item_id || !lot.item_name) return null;
      const qty = Number(lot.qty_packs ?? 0);
      const rate = Number(lot.rate ?? 0);
      let vol = Number((lot as any).volume_ml ?? 0);
      if (vol <= 0 && lot.category === 'alcohol' && lot.pack_label?.toUpperCase().includes('BOTTLE')) {
        vol = 750;
      }
      return {
        lot_id: lot.id ?? '',
        variant_id: lot.item_id,
        name: lot.item_name,
        qty: qty,
        rate: rate,
        pack_label: lot.pack_label ?? '',
        volume_ml: vol,
        category: lot.category ?? '',
      };
    }).filter((item): item is { lot_id: string; variant_id: string; name: string; qty: number; rate: number; pack_label: string; volume_ml: number; category: string } => item !== null);
  }, [inventory]);

  // Filtered inventory based on search query and category
  const filteredInventory = useMemo(() => {
    return aggregatedInventory.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [aggregatedInventory, searchQuery, selectedCategory]);

  const categories = [
    { value: 'all', label: 'All Items' },
    { value: 'alcohol', label: 'Alcohol' },
    { value: 'cigar', label: 'Cigars' },
    { value: 'grocery', label: 'Snacks' },
    { value: 'soft_drink', label: 'Cold Drinks' },
  ];

  const totalAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  }, [lines]);

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleAddItem = (item: typeof aggregatedInventory[number]) => {
    const existingIndex = lines.findIndex(l => l.lot_id === item.lot_id);
    if (existingIndex > -1) {
      const updated = [...lines];
      updated[existingIndex].quantity = parseFloat((updated[existingIndex].quantity + 1).toFixed(2));
      setLines(updated);
    } else {
      const pegsPerBottle = item.volume_ml / 30;
      const isLiquid = pegsPerBottle > 0;
      const defaultUnit = isLiquid ? 'peg' : 'bottle';
      const rate = isLiquid ? (item.rate / pegsPerBottle) : item.rate;

      setLines([
        ...lines,
        {
          variant_id: item.variant_id,
          lot_id: item.lot_id,
          quantity: 1, // default peg selection should be small (1)
          rate: rate,
          name: item.name,
          availableStock: item.qty,
          unit: defaultUnit,
          volume_ml: item.volume_ml,
        }
      ]);
    }
  };

  const handleLineChange = (index: number, field: keyof ChitLineItem, value: any) => {
    const updated = [...lines];
    if (field === 'unit') {
      const oldUnit = updated[index].unit;
      const newUnit = value as 'bottle' | 'peg';
      if (oldUnit !== newUnit) {
        const pegsPerBottle = updated[index].volume_ml / 30;
        if (pegsPerBottle > 0) {
          const lot = aggregatedInventory.find(v => v.lot_id === updated[index].lot_id);
          const lotRate = lot ? lot.rate : updated[index].rate;
          
          if (newUnit === 'peg') {
            updated[index] = {
              ...updated[index],
              unit: newUnit,
              rate: lotRate / pegsPerBottle,
              quantity: 1, // default peg selection should be small (1)
            };
          } else {
            updated[index] = {
              ...updated[index],
              unit: newUnit,
              rate: lotRate,
              quantity: 1, // default bottle selection should be 1
            };
          }
        }
      }
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }
    setLines(updated);
  };

  // Safe wrapper for server action
  const formSubmitHandler = async (state: any, formData: FormData) => {
    // Basic verification of selected member/guest
    if (consumerType === 'member' && !profileId) {
      return { error: 'Please select a member' };
    }
    if (consumerType === 'guest' && !guestName) {
      return { error: 'Guest name is required' };
    }

    // Collect line items
    const validLines = lines.filter(l => l.variant_id);
    if (validLines.length === 0) {
      return { error: 'Please add at least one item' };
    }

    // Client-side stock check validation
    for (const l of validLines) {
      const quantityInBottles = l.unit === 'peg' ? l.quantity / (l.volume_ml / 30) : l.quantity;
      if (quantityInBottles > l.availableStock + 0.0001) {
        const pegsAvailable = l.availableStock * (l.volume_ml / 30);
        const stockMessage = l.unit === 'peg'
          ? `${pegsAvailable.toFixed(1)} pegs`
          : `${l.availableStock.toFixed(2)} ${getBaseUnitName(aggregatedInventory.find(v => v.lot_id === l.lot_id)?.pack_label ?? null).toLowerCase()}s`;
        return { error: `Requested quantity for ${l.name} exceeds available stock (${stockMessage})` };
      }
    }

    const payload = {
      unit_id: unitId,
      date: new Date().toISOString().split('T')[0],
      consumer_type: consumerType,
      profile_id: consumerType === 'member' ? (profileId || null) : null,
      guest_name: consumerType === 'guest' ? (guestName || null) : null,
      booking_id: consumerType === 'guest' ? (bookingId || null) : null,
      items: validLines.map(l => ({
        variant_id: l.variant_id,
        lot_id: l.lot_id,
        quantity: l.quantity,
        rate: l.rate,
        name: l.name,
        unit: l.unit,
      })),
    };

    return await createBarChitAction(state, payload);
  };

  const [state, formAction, isPending] = useActionState(formSubmitHandler, null);

  useActionResult(state, {
    onOk: () => {
      toast.success('Bar chit created successfully');
      setLines([]);
      setProfileId('');
      setGuestName('');
      setBookingId('');
      onClose();
    },
    onError: (err) => {
      toast.error(err);
    },
  });

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Create Bar Chit"
      description="Log consumption for a dining-in member or mess guest"
      contentClassName="sm:max-w-5xl max-h-[95vh] overflow-y-auto"
    >
      <form action={formAction} className="space-y-6 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[500px]">
          {/* Left Column (Catalogue) */}
          <div className="md:col-span-7 flex flex-col space-y-4">
            <h3 className="font-semibold text-sm">Product Catalogue</h3>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search items by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {categories.map((cat) => (
                <Button
                  key={cat.value}
                  type="button"
                  variant={selectedCategory === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.value as any)}
                  className="h-8 rounded-full text-xs font-medium px-3.5 transition-all"
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {/* Catalog Grid */}
            {filteredInventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg border-muted/60 p-4 min-h-[250px]">
                <ShoppingBag className="size-8 text-muted-foreground/40 mb-3" />
                <h3 className="font-semibold text-sm">No items found</h3>
                <p className="text-xs text-muted-foreground max-w-[250px] mt-1">
                  Try adjusting your search or category filter.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto max-h-[50vh] pr-1">
                {filteredInventory.slice(0, 48).map((item) => (
                  <button
                    key={item.lot_id}
                    type="button"
                    onClick={() => handleAddItem(item)}
                    className="flex flex-col text-left p-3 border rounded-xl bg-card hover:bg-muted/40 hover:border-muted-foreground/30 active:scale-98 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 space-y-2 h-full"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold text-xs line-clamp-2 leading-snug">{item.name}</div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px] h-4.5 px-1.5 py-0 capitalize">
                          {item.category === 'grocery' ? 'Snack' : item.category === 'soft_drink' ? 'Cold Drink' : item.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">({item.pack_label})</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-muted/50 w-full">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-muted-foreground">Rate:</span>
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">
                          {item.volume_ml > 0 
                            ? `₹${(item.rate / (item.volume_ml / 30)).toFixed(0)}/peg`
                            : `₹${item.rate.toFixed(0)}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Stock:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {item.volume_ml > 0
                            ? `${item.qty} btl (${Math.floor(item.qty * (item.volume_ml / 30))} pegs)`
                            : `${item.qty} units`}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {filteredInventory.length > 48 && (
              <div className="text-xs text-center text-muted-foreground py-2 border-t mt-3">
                Showing top 48 of {filteredInventory.length} items. Refine search to see more.
              </div>
            )}
          </div>

          {/* Right Column (Checkout/Cart) */}
          <div className="md:col-span-5 flex flex-col space-y-4 md:border-l md:pl-6">
            <h3 className="font-semibold text-sm">Chit Details & Cart</h3>
            
            {/* Consumer Type Toggle */}
            <div className="flex rounded-md bg-muted p-1 w-full shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConsumerType('member')}
                className={cn(
                  "flex-1 text-xs font-medium py-1.5 h-auto rounded-sm",
                  consumerType === 'member' ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
                )}
              >
                Member
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConsumerType('guest')}
                className={cn(
                  "flex-1 text-xs font-medium py-1.5 h-auto rounded-sm",
                  consumerType === 'guest' ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
                )}
              >
                Guest
              </Button>
            </div>

            {/* Member Selector */}
            {consumerType === 'member' && (
              <Field className="space-y-2 shrink-0">
                <FieldLabel className="text-xs">Select Member</FieldLabel>
                <Popover open={openMemberPicker} onOpenChange={setOpenMemberPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openMemberPicker}
                      className="w-full justify-between font-normal text-left h-9 text-xs"
                    >
                      {selectedMember ? (
                        <span className="truncate">
                          {selectedMember.rank ? `${selectedMember.rank} ` : ''}
                          {selectedMember.full_name} 
                          {selectedMember.service_no ? ` (${selectedMember.service_no})` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search member...</span>
                      )}
                      <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search member..." className="text-xs" />
                      <CommandList>
                        <CommandEmpty>No members found.</CommandEmpty>
                        <CommandGroup>
                          {members.map(member => (
                            <CommandItem
                              key={member.id}
                              value={`${member.full_name} ${member.service_no ?? ''} ${member.rank ?? ''}`}
                              onSelect={() => {
                                setProfileId(member.id);
                                setOpenMemberPicker(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={cn(
                                  "size-4 mr-2",
                                  member.id === profileId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div>
                                <div className="font-medium">
                                  {member.rank ? `${member.rank} ` : ''}
                                  {member.full_name}
                                </div>
                                {member.service_no && (
                                  <div className="text-[10px] text-muted-foreground">
                                    Service No: {member.service_no}
                                  </div>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
            )}

            {/* Guest Details */}
            {consumerType === 'guest' && (
              <div className="space-y-3 shrink-0">
                <Field className="space-y-1">
                  <FieldLabel className="text-xs">Guest Name</FieldLabel>
                  <Input
                    placeholder="Enter guest name"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    required
                    className="h-9 text-xs"
                  />
                </Field>

                <Field className="space-y-1">
                  <FieldLabel className="text-xs">Link to Booking (Optional)</FieldLabel>
                  <Popover open={openBookingPicker} onOpenChange={setOpenBookingPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openBookingPicker}
                        className="w-full justify-between font-normal text-left h-9 text-xs"
                      >
                        {selectedBooking ? (
                          <span className="truncate">{selectedBooking.guest_name} ({selectedBooking.room_name})</span>
                        ) : (
                          <span className="text-muted-foreground">Select active room booking...</span>
                        )}
                        <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search active bookings..." className="text-xs" />
                        <CommandList>
                          <CommandEmpty>No active bookings found.</CommandEmpty>
                          <CommandGroup>
                            {bookings.map(booking => (
                              <CommandItem
                                key={booking.id}
                                value={`${booking.guest_name} ${booking.room_name}`}
                                onSelect={() => {
                                  setBookingId(booking.id);
                                  setOpenBookingPicker(false);
                                }}
                                className="text-xs"
                              >
                                <Check
                                  className={cn(
                                    "size-4 mr-2",
                                    booking.id === bookingId ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div>
                                  <div className="font-medium">{booking.guest_name}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Room: {booking.room_name} ({booking.status})
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
              </div>
            )}

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto max-h-[35vh] space-y-3 pr-1">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-lg border-muted/60 p-4">
                  <ShoppingCart className="size-8 text-muted-foreground/35 mb-2.5" />
                  <h4 className="font-semibold text-xs text-muted-foreground">Cart is empty</h4>
                  <p className="text-[10px] text-muted-foreground/85 max-w-[180px] mt-1">
                    Select items from the catalog on the left to build this chit.
                  </p>
                </div>
              ) : (
                lines.map((line, index) => (
                  <div key={index} className="p-3 border rounded-xl bg-card/50 space-y-2.5 relative group hover:border-muted-foreground/35 transition-all duration-200">
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <h4 className="font-semibold text-xs leading-snug line-clamp-1">{line.name}</h4>
                        <p className="text-[10px] text-muted-foreground">
                          Available: {line.availableStock} {getBaseUnitName(aggregatedInventory.find(v => v.lot_id === line.lot_id)?.pack_label ?? null)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveLine(index)}
                        className="size-6 text-muted-foreground hover:text-destructive shrink-0 -mt-1 -mr-1 rounded-full"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      {/* Unit Select */}
                      <div className="w-[105px] shrink-0">
                        <Select
                          value={line.unit}
                          onValueChange={(v) => handleLineChange(index, 'unit', v)}
                        >
                          <SelectTrigger className="h-8 text-[11px] transition-colors">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bottle">
                              {getBaseUnitName(aggregatedInventory.find(v => v.lot_id === line.lot_id)?.pack_label ?? null)}
                            </SelectItem>
                            <SelectItem value="peg" disabled={line.volume_ml <= 0}>Peg</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quantity Modifier */}
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={line.quantity <= 0.05}
                          onClick={() => handleLineChange(index, 'quantity', Math.max(0.01, parseFloat((line.quantity - 1).toFixed(2))))}
                          className="size-7 shrink-0 select-none rounded-md"
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={e => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="h-7 w-12 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded-md"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleLineChange(index, 'quantity', parseFloat((line.quantity + 1).toFixed(2)))}
                          className="size-7 shrink-0 select-none rounded-md"
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    {/* Small/Large Presets for pegs */}
                    {line.unit === 'peg' && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant={line.quantity === 1 ? "default" : "outline"}
                          size="xs"
                          onClick={() => handleLineChange(index, 'quantity', 1)}
                          className="flex-1 h-6.5 text-[10px] font-medium transition-colors rounded-md"
                        >
                          Small Peg (1)
                        </Button>
                        <Button
                          type="button"
                          variant={line.quantity === 2 ? "default" : "outline"}
                          size="xs"
                          onClick={() => handleLineChange(index, 'quantity', 2)}
                          className="flex-1 h-6.5 text-[10px] font-medium transition-colors rounded-md"
                        >
                          Large Peg (2)
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-muted/50">
                      <span className="text-[10px] text-muted-foreground">
                        Rate: ₹{line.rate.toFixed(2)} / {line.unit === 'peg' ? 'peg' : 'unit'}
                      </span>
                      <span className="font-semibold text-xs">
                        ₹{(line.quantity * line.rate).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals & Submit */}
            <div className="space-y-3 pt-3 border-t shrink-0">
              <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded-lg border">
                <span className="font-semibold text-xs">Total Chit Amount</span>
                <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                  ₹{totalAmount.toFixed(2)}
                </span>
              </div>

              <FormError message={state?.error} />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="h-8.5 text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending || lines.length === 0 || lines.some(l => l.quantity <= 0)} className="h-8.5 text-xs">
                  {isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Creating...
                    </>
                  ) : (
                    'Create Chit'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </AdaptiveModal>
  );
}
