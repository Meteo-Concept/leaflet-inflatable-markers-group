Demo
====

* Demo with a single group: [example1](example1). This shows the mean daily max temperature averaged
  over one year, averaged over the period 1990-2020 for Météo-France stations in
  Brittany, France (source: [Météo-France](https://donneespubliques.meteofrance.fr/?fond=produit&id_produit=117&id_rubrique=39))

* Demo with two groups: [example2](example2). Similar data but we have
  arbitrarily separated it in two groups, main and secondary.

* Demo with a single group but with a lot of markers and collisions (to assess performance for your use case) :
  [example3](example3). This looks a lot like the first example but with temperature for a specific day
  in January 2024 from many stations by Météo-France and other providers (source: [MétéoData](https://www.meteodata.fr)).
  Notice how we leverage the zoom event to hide the deflated icons on lower zooms tofurther improve legibility.
