function wideGameIcons() {
	const element = {
	  act(el, callback, opts) {
		const observer = new MutationObserver(callback);
		observer.observe(el, opts);
	
		return observer;
	  },
	
	  wait(selector, parent = document) {
		return new Promise((resolve) => {
		  const el = parent.querySelector(selector);
		  if (el) {
			resolve(el);
		  }
	
		  const observer = new MutationObserver(() => {
			const el = parent.querySelector(selector);
			if (!el) {
			  return;
			}
	
			resolve(el);
			observer.disconnect();
		  });
	
		  observer.observe(document.body, {
			subtree: true,
			childList: true,
		  });
		});
	  },
	};
	
	document.head.innerHTML += `<style>
	  ._3vHkmRShhzwd67_MtEq8-n /* cssgrid_CSSGrid */ {
		grid-auto-rows: 108px !important;
		grid-template-columns: repeat(auto-fill, 230px) !important;
	  }
	  
	  ._1R9r2OBCxAmtuUVrgBEUBw._3Ehhd5MxErV_bXQE4qVhzB /* libraryassetimage_Container libraryassetimage_PortraitImage */ {
		padding-top: 0;
	  }
	</style>`;
	
	// library_AppDetailsMain
	element.wait(`._2Nq6ov7A1hGcHXVOXNt_OE`).then((elLibraryContainer) => {
	  element.act(
		elLibraryContainer,
		() => {
		  // appportrait_Draggable
		  let arrGames = elLibraryContainer.querySelectorAll(`
			._3vHkmRShhzwd67_MtEq8-n ._1pwP4eeP1zQD7PEgmsep0W
		  `);
	
		  arrGames.forEach((elImageContainer) => {
			// libraryassetimage_Image
			let elImage = elImageContainer.querySelector(
			  `._24_AuLm54JVe1Zc0AApCDR`
			);

			let nAppID = elImage.src.match(/\d+/)?.[0];
	
			// God knows why urlStore.BuildCachedLibraryAssetURL does not work
			elImage.src = `${window.opener.urlStore.ResolveURL(
			  "StoreAppImages"
			)}/${nAppID}/header.jpg`;
		  });
		},
		{ childList: true }
	  );
	});
  }
  
  // Export the function
  export { wideGameIcons };
  