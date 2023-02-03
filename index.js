importScripts("https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js");

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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.2/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.2/dist/wheels/panel-0.14.2-py3-none-any.whl', 'pyodide-http==0.1.0', 'holoviews>=1.15.1', 'holoviews>=1.15.1', 'hvplot', 'pandas', 'param', 'xarray']
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

# https://panel.holoviz.org/user_guide/Running_in_Webassembly.html

import xarray
# import datashader as ds
import panel as pn
import holoviews as hv
import hvplot.pandas

import pandas as pd

pn.extension( template="fast")
# pn.state.template.param.update(site="Panel in the Browser", title="XGBoost Example")

cl_attrs = pd.read_csv("https://raw.githubusercontent.com/subduedpositron/subduedpositron.github.io/main/cl_attrs.csv")[:10][["cl_key", "RA", "DEC", "rh,l"]]
import param

hv.extension('bokeh')

class Clusters(param.Parameterized):
    cl_attrs = param.DataFrame()
clusters = Clusters(cl_attrs=cl_attrs)
cl_attrs_table = pn.Column(clusters.param.cl_attrs, width=500)

# pn.Row( 
#     cl_attrs.hvplot.scatter(x="RA", y="DEC"),
#     cl_attrs_table).servable()


sel_cl_keys = ['ngc3201', 'ngc6656', 'ngc6205']
# import datatable as dt
# bright_cl_srcs = dt.fread("https://raw.githubusercontent.com/subduedpositron/subduedpositron.github.io/main/bright_cl_srcs.jay").to_pandas()
bright_cl_srcs = pd.read_csv("https://raw.githubusercontent.com/subduedpositron/subduedpositron.github.io/main/bright_cl_srcs.csv")

class View_Cls(param.Parameterized):
    sel_cl_key = param.ObjectSelector(objects=sel_cl_keys, default=sel_cl_keys[0])
    
    @param.depends("sel_cl_key")
    def plt_sel_cl_srcs(self):
        sel_cl_srcs = bright_cl_srcs[bright_cl_srcs.cl_key == self.sel_cl_key]
        # return sel_cl_srcs.hvplot.scatter(x="RA", y="DEC", cmap='gray', size=1, color='gray').opts(height=300, width=400)
        return sel_cl_srcs.hvplot.scatter(x="RA", y="DEC", size=1, color='gray').opts(height=300, width=400) #', rasterize=True
view_cls = View_Cls()
pn.Column(
    view_cls.param,
    view_cls.plt_sel_cl_srcs).servable()

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