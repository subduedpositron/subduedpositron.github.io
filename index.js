importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = [
    'https://raw.githubusercontent.com/subduedpositron/subduedpositron.github.io/main/scaf-0.0.3-py3-none-any.whl',
    'https://raw.githubusercontent.com/subduedpositron/subduedpositron.github.io/main/fast_histogram-0.11-cp36-abi3-emscripten_3_1_27_wasm32.whl',
    'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 
  "openpyxl",
  'astroplan',
  
  
  'artpop', 'holoviews>=1.15.4', 'numpy', 'param', 
]
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import sys


import artpop

#for module in ["scaf"]: # "obsv", "lmc", "lgs", "load_glxs", "load_mw_clusters", "cdl", "gaia", 
#    sys.path = [f"/Users/justinhelbert/workspace/{module}/"] + sys.path



from scaf.spec_images.spec_targets import SpecTargetsBlock

from holoviews import opts
# opts.defaults(opts.Scatter(bgcolor='black', width=300, height=200, axiswise=True))
# opts.defaults(opts.Histogram(bgcolor='black', width=300, height=200))

import param
import panel as pn



import param
import numpy as np



from scaf.stat_fns import gen_gcl_populations
# from scaf import api_artpop_uses as api_au
# import artpop


# util.clus_ident_harris.query("@util.clus_ident_harris.Ident.cl_key in @sel_gcls_PLfits.cl_key")


from scaf.imager_artpop import imager_clusters

from scaf import example_objs
class SpecImages(pn.viewable.Viewer):
    # inst = param.ObjectSelector()
    
    def __init__(self, gs,  **params):
        self.gs = gs

        super().__init__(**params)
        self._layout = self._get_view()   
        

    def __panel__(self):
        return self._layout

    def _get_view(self):
        radial_model="king" # CONSTANT for now

        imager = imager_clusters.Imager_SpecTargetsBlock(
            SpecTargetsBlock=self.gs.SpecTargetsBlock,
            radial_model=radial_model   
        )

        # should this be inside Imager_RadialModels ?
        # imager.inst.xy_dim *= self.gs.SpecTargetsBlock.grid_size
        # if imager.inst.xy_dim % 2 == 0:
        #     imager.inst.xy_dim += 1

        # self.v_allsky_targets.view_targets_all_radec(),

        return pn.Row(self.gs.view, imager)

           
from scaf import GS




def run_panel_servable():
    """ vw.servable() for panel serve """
    Sel_gcls, Sel_gcls_PLfits = gen_gcl_populations.select_gcls_and_PLfits()
    gs = GS.GameState(cl_keys_cand=list(Sel_gcls.Ident.cl_key)[:10])
    gs.SpecTargetsBlock.instrument = example_objs.inst_NIR
    gs.SpecTargetsBlock.param['instrument'].objects = [example_objs.inst_modified_Lugger95, example_objs.inst_NIR]
    vw = SpecImages(gs)
    vw.servable()

run_panel_servable()

await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()