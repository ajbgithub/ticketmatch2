useEffect(() => {
  if (!selectedPoll) return;

  let cancelled = false;

  (async () => {
    const { data, error } = await supabase.rpc('get_poll_totals', {
      p_poll_id: selectedPoll,
    });

    if (error) {
      console.error('get_poll_totals error', error);
      return;
    }

    if (!cancelled && data?.length) {
      setPollTotals(data[0]);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [selectedPoll]);
